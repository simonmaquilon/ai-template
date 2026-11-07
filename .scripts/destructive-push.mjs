// Decides whether a shell command runs a git push that overwrites or deletes
// remote refs, against the approval rule of AGENTS.md, for the push hook, and
// names what it found. A push is destructive when it carries an option that
// force-pushes, deletes, mirrors, or prunes, as a long option or an
// unambiguous abbreviation of one, or a short-option cluster holding -f or -d;
// a refspec that starts with + or : followed by a name; inline configuration
// that makes a remote a mirror, gives it a refspec that forces or deletes, or
// includes a file: -c or --config-env on any git command, so an alias cannot
// hide it, or the GIT_CONFIG_* variables set anywhere in the command; or a
// target remote whose configuration does the same, read from the folder the
// push starts in, from -C, and from each folder the command changes into
// before it. A push to a URL checks no persisted configuration.
// staging-reader.mjs walks every command the text runs, directly or behind
// aliases, script files, make targets, eval, and shells.

import { resolve } from 'node:path';
import { git } from './hook-support.mjs';
import { GIT, gitSubcommand, walk } from './staging-reader.mjs';

const LONG = ['force', 'force-with-lease', 'force-if-includes', 'delete', 'mirror', 'prune'];
const LONG_VALUES = ['repo', 'receive-pack', 'exec', 'push-option', 'recurse-submodules'];
const INLINE_CONFIG = /^GIT_CONFIG_(?:PARAMETERS|COUNT|KEY_\d+|GLOBAL|SYSTEM)=/;
const INLINE_ANYWHERE = /\bGIT_CONFIG_(?:PARAMETERS|COUNT|KEY_\d+|GLOBAL|SYSTEM)\s*=/;
const CHANGES_DIRECTORY = /^(?:cd|chdir|pushd|Set-Location|Push-Location|sl)$/i;
const MIRROR_KEY = /^remote\..+\.mirror$/i;
const PUSH_KEY = /^remote\..+\.push$/i;
const INCLUDE_KEY = /^include\.path$|^includeif\..+\.path$/i;
const FALSE = /^(?:false|no|off|[+-]?0+[kmg]?)?$/i;
const REWRITING = /^(?:\+|:.)/;

// What the options and arguments after push do: the first destructive option or
// refspec found, the repository, and the refspecs.
function readPush(rest) {
  let found = null;
  let option;
  const positionals = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('-') || arg === '-') {
      positionals.push(arg);
    } else if (arg === '--') {
      positionals.push(...rest.slice(i + 1));
      break;
    } else if (arg.startsWith('--')) {
      const [name, ...value] = arg.slice(2).split('=');
      if (name === '' || name.startsWith('no-')) continue;
      if (LONG.some((long) => long.startsWith(name))) {
        found ??= `uses ${arg}`;
      } else if (LONG_VALUES.some((long) => long.startsWith(name))) {
        const given = value.length > 0 ? value.join('=') : rest[++i];
        if (name.length > 2 && 'repo'.startsWith(name)) option = given;
      }
    } else {
      for (let j = 1; j < arg.length; j++) {
        if (arg[j] === 'o') {
          if (j === arg.length - 1) i++;
          break;
        }
        if (arg[j] === 'f' || arg[j] === 'd') found ??= `uses ${arg}`;
      }
    }
  }
  // git takes the first argument as the repository and --repo only when there is none.
  const repository = positionals.shift() ?? option;
  const refspec = positionals.find((spec) => REWRITING.test(spec));
  if (refspec) found ??= `${refspec[0] === '+' ? 'forces' : 'deletes'} ${refspec.slice(1)} with ${refspec}`;
  return { found, repository, refspecs: positionals };
}

// The first global configuration that makes a remote a mirror, gives it a refspec that forces or deletes, or includes a file.
function inlineConfig(options) {
  for (const [name, setting = ''] of options) {
    const fromEnv = name === '--config-env' || name.startsWith('--config-env=');
    if (name !== '-c' && !fromEnv) continue;
    const [key, ...rest] = (name === '-c' || name === '--config-env' ? setting : name.slice(13)).split('=');
    const value = rest.join('=');
    const set = fromEnv || (MIRROR_KEY.test(key) && (rest.length === 0 || !FALSE.test(value))) || (PUSH_KEY.test(key) && REWRITING.test(value));
    if (INCLUDE_KEY.test(key) || (set && (MIRROR_KEY.test(key) || PUSH_KEY.test(key)))) return `sets ${key} inline`;
  }
  return null;
}

// The reason the configuration of the remote a push targets makes it destructive, as git resolves the remote.
function persisted(dir, repository, refspecs) {
  const config = (...args) => git(['-C', dir, 'config', ...args])?.trim() ?? '';
  const remotes = (git(['-C', dir, 'remote']) ?? '').split(/\r?\n/);
  const branch = git(['-C', dir, 'symbolic-ref', '--short', '-q', 'HEAD'])?.trim();
  const remote = repository !== undefined ? repository
    : (branch && config(`branch.${branch}.pushRemote`)) || config('remote.pushDefault') || (branch && config(`branch.${branch}.remote`)) || 'origin';
  if (!remotes.includes(remote)) return null;
  if (config('--type=bool', '--get', `remote.${remote}.mirror`) === 'true') return `pushes to remote ${remote}, configured as a mirror`;
  const rewriting = refspecs.length === 0 && config('--get-all', `remote.${remote}.push`).split(/\r?\n/).some((spec) => REWRITING.test(spec));
  return rewriting ? `pushes to remote ${remote}, configured with a refspec that forces or deletes` : null;
}

// The reason one git invocation is a destructive push, or null; dirs are the
// folders whose configuration the push may read.
function pushReason(args, env, text, dirs) {
  const { index, options } = gitSubcommand(args);
  const inline = inlineConfig(options);
  if (inline) return inline;
  if (args[index] !== 'push') return null;
  const { found, repository, refspecs } = readPush(args.slice(index + 1));
  if (found) return found;
  if (INLINE_ANYWHERE.test(text) || env.some((word) => INLINE_CONFIG.test(word))) return 'sets git configuration inline';
  for (const from of dirs) {
    const dir = options.filter(([name]) => name === '-C').reduce((base, [, path]) => resolve(base, path), from);
    const reason = persisted(dir, repository, refspecs);
    if (reason) return reason;
  }
  return null;
}

// The reason a command, as text read with each of the given readings (true for
// PowerShell) or as an argument list, runs a destructive push, or null. Throws
// when the command nests too deep to read.
export function destructivePush(command, { readings, cwd }) {
  let reason = null;
  const text = [command ?? []].flat().join(' ');
  const dirs = [cwd];
  const visit = ({ name, args, env = [], cwd: dir }) => {
    if (CHANGES_DIRECTORY.test(name)) {
      const target = args.find((arg) => !arg.startsWith('-'));
      if (target) dirs.push(resolve(dir ?? cwd, target));
    } else if (GIT.test(name)) {
      reason = pushReason(args, env, text, dirs);
    }
    return reason !== null;
  };
  if (Array.isArray(command)) walk(command, { cwd, visit });
  else readings.some((powershell) => walk(String(command ?? ''), { powershell, cwd, visit }));
  return reason;
}
