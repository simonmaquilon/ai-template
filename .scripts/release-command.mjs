// Finds, in a shell command, what publishes a release of the maintained template, for the release hook: a git push that
// publishes a tag, and gh release create or its alias new. It only reads the command, never the repository; the
// commands come from staging-reader.mjs as the push hook reads them. Each finding is
// { kind: 'push', all, specs, dir } for a push, where all marks --tags, --follow-tags, or --mirror and specs are the
// refspecs that may name a tag as { src, dst, tag } (tag is the name after the word `tag`), or
// { kind: 'release', tag, target, dir } for a release, dir being the folder the command runs in. A push that deletes,
// and a refspec that deletes, are no finding. Throws when the command nests too deep to read.

import { resolve } from 'node:path';
import { GIT, gitSubcommand, walk } from './staging-reader.mjs';

const GH = /^(?:.*[\\/])?gh(?:\.exe)?$/i;
const CHANGES_DIRECTORY = /^(?:cd|chdir|pushd|Set-Location|Push-Location|sl)$/i;
const ALL_TAGS = ['tags', 'follow-tags', 'mirror'];
const VALUES = ['receive-pack', 'exec', 'repo', 'push-option', 'recurse-submodules'];
const OTHERS = ['all', 'branches', 'prune', 'delete', 'atomic', 'dry-run', 'porcelain', 'force', 'force-with-lease', 'force-if-includes',
  'set-upstream', 'thin', 'signed', 'progress', 'verbose', 'quiet', 'verify', 'ipv4', 'ipv6', ...VALUES];
const RELEASE_VALUES = /^(?:-[tnFR]|--(?:title|notes|notes-file|target|notes-start-tag|discussion-category|repo))$/;

// The long option of git push a name stands for, as git takes an exact name or an unambiguous abbreviation.
function longOption(name) {
  const all = [...ALL_TAGS, ...OTHERS];
  return all.includes(name) ? name : (all.filter((long) => long.startsWith(name)).length === 1 ? all.find((long) => long.startsWith(name)) : null);
}

// The options and refspecs after push, or null when the push deletes.
function readPush(rest, dir) {
  let all = false;
  let deleting = false;
  const positionals = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('-') || arg === '-') positionals.push(arg);
    else if (arg === '--') {
      positionals.push(...rest.slice(i + 1));
      break;
    } else if (arg.startsWith('--')) {
      const [name, ...value] = arg.slice(2).split('=');
      const long = name === '' || name.startsWith('no-') ? null : longOption(name);
      if (ALL_TAGS.includes(long)) all = true;
      else if (long === 'delete') deleting = true;
      else if (VALUES.includes(long) && value.length === 0) i++;
    } else {
      for (let j = 1; j < arg.length; j++) {
        if (arg[j] === 'o') {
          if (j === arg.length - 1) i++;
          break;
        }
        if (arg[j] === 'd') deleting = true;
      }
    }
  }
  if (deleting) return null;
  const specs = [];
  // git takes the first argument as the repository, and --repo only when there is none.
  const refspecs = positionals.slice(1);
  for (let i = 0; i < refspecs.length; i++) {
    const spec = refspecs[i].replace(/^\+/, '');
    if (spec === 'tag' && i + 1 < refspecs.length) specs.push({ tag: refspecs[++i] });
    else if (!spec.startsWith(':')) {
      const [src, ...dst] = spec.split(':');
      specs.push({ src, dst: dst.length > 0 ? dst.join(':') : undefined });
    }
  }
  return all || specs.length > 0 ? { kind: 'push', all, specs, dir } : null;
}

// The tag and the target a gh release create names, or null for another gh command.
function readRelease(args, dir) {
  const words = [];
  let target;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      const [name, ...value] = arg.split('=');
      const given = arg.startsWith('--') && value.length > 0;
      if (words.length >= 2 && name === '--target') target = given ? value.join('=') : args[i + 1];
      if (!given && (words.length >= 2 ? RELEASE_VALUES : /^(?:-R|--repo)$/).test(arg)) i++;
    } else words.push(arg);
  }
  const [group, action, tag] = words;
  return group === 'release' && (action === 'create' || action === 'new') && tag !== undefined ? { kind: 'release', tag, target, dir } : null;
}

// The findings of a command, as text read with each reading (true for PowerShell) or as an argument list.
export function releaseCommands(command, { readings, cwd }) {
  const found = [];
  let here = cwd;
  const visit = ({ name, args, cwd: dir }) => {
    if (CHANGES_DIRECTORY.test(name)) {
      const target = args.find((arg) => !arg.startsWith('-'));
      if (target) here = resolve(dir ?? cwd, target);
    } else if (GIT.test(name)) {
      const { index, options } = gitSubcommand(args);
      const base = options.filter(([option]) => option === '-C').reduce((from, [, path]) => resolve(from, path), here);
      if (args[index] === 'push') found.push(readPush(args.slice(index + 1), base));
    } else if (GH.test(name)) {
      found.push(readRelease(args, here));
    }
    return false;
  };
  if (Array.isArray(command)) walk(command, { cwd, visit });
  else readings.forEach((powershell) => walk(String(command ?? ''), { powershell, cwd, visit }));
  return found.filter(Boolean);
}
