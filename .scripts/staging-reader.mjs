// Walks every simple command a script runs, for the staging hooks. Within a
// script it substitutes the variables the script assigns, PowerShell names
// ignoring case, and skips shell keywords, environment assignments, and
// wrappers such as env or sudo with their options; after xargs it reports the
// git command xargs runs. It then descends into what the command runs beyond
// its text through hidden-commands.mjs: eval, a shell's -c or file script, a
// here-document fed to a shell, a sourced or path-run file, make targets, and
// git aliases; a PowerShell $name = <command> runs its command too.
// visit({ name, args, fed, xargs }) returns true to stop, and walk
// returns whether it stopped; nesting deeper than MAX_DEPTH throws. A script
// may also be an argument list, read as one command.

import { aliasScripts, fileScripts, makeScripts, shellScripts } from './hidden-commands.mjs';
import { commands } from './shell-commands.mjs';

export const GIT = /^(?:.*[\\/])?git(?:\.exe)?$/i;
const SHELL = /^(?:.*[\\/])?(?:(?:ba|z|k|da)?sh|pwsh|powershell)(?:\.exe)?$/i;
const KEYWORDS = new Set(['!', '{', '}', 'if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until']);
const WRAPPERS = new Set(['command', 'env', 'exec', 'nohup', 'sudo', 'time']);
const GLOBAL_VALUES = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env']);
const MAX_DEPTH = 8;

// Where a git command's subcommand starts after its global options, and the
// values of its -c options.
export function gitSubcommand(args) {
  let index = 0;
  const globals = [];
  while (args[index]?.startsWith('-')) {
    if (args[index] === '-c') globals.push(args[index + 1] ?? '');
    index += GLOBAL_VALUES.has(args[index]) ? 2 : 1;
  }
  return { index, globals };
}

// Variables a command assigns without running anything, as [name, value] pairs.
function assignments(words) {
  const posix = ['export', 'local', 'declare'].includes(words[0]) ? words.slice(1) : words;
  if (posix.length > 0 && posix.every((word) => /^\w+=/.test(word))) return posix.map((word) => word.split(/=(.*)/s).slice(0, 2));
  const ps = /^\$(\w+)(?:=(.*))?$/s.exec(words[0] ?? '');
  if (ps && (ps[2] !== undefined ? words.length === 1 : words[1] === '=')) return [[ps[1], ps[2] ?? words.slice(2).join(' ')]];
  return null;
}

export function walk(script, { powershell = false, cwd, visit }, depth = 0, seen = new Set()) {
  if (depth > MAX_DEPTH) throw new Error('nested too deep');
  const nested = ({ script: inner, powershell: innerPowershell }) => walk(inner, { powershell: innerPowershell, cwd, visit }, depth + 1, seen);
  const variables = new Map();
  const key = (name) => (powershell ? name.toLowerCase() : name);
  const list = Array.isArray(script) ? [{ words: script.map(String), bodies: [], fed: false }] : commands(script, { powershell });
  return list.some(({ words, bodies, fed }) => {
    const expanded = words.map((word) => word.replace(/\$\{?(\w+)\}?/g, (text, name) => variables.get(key(name)) ?? text));
    const assigned = assignments(expanded);
    for (const [name, value] of assigned ?? []) variables.set(key(name), value);
    // A PowerShell $name = <command> also runs that command.
    if (assigned) return expanded[1] === '=' && expanded.length > 2 && run(expanded.slice(2), bodies, fed);
    return run(expanded, bodies, fed);
  });

  function run(expanded, bodies, fed) {
    let i = 0;
    while (i < expanded.length) {
      if (expanded[i] === 'xargs') {
        const git = expanded.findIndex((word, k) => k > i && GIT.test(word));
        return git !== -1 && visit({ name: expanded[git], args: expanded.slice(git + 1), fed: true, xargs: true });
      }
      if (/^\w+=/.test(expanded[i]) || KEYWORDS.has(expanded[i])) i++;
      else if (WRAPPERS.has(expanded[i])) for (i++; expanded[i]?.startsWith('-'); ) i += /^-[ug]$/.test(expanded[i]) ? 2 : 1;
      else break;
    }
    const [name, ...args] = expanded.slice(i);
    if (name === undefined) return false;
    if (visit({ name, args, fed, xargs: false })) return true;
    if (name === 'eval') return nested({ script: args.join(' '), powershell });
    let hidden;
    if (GIT.test(name)) {
      const { index, globals } = gitSubcommand(args);
      hidden = aliasScripts(globals, args[index], args.slice(index + 1), cwd);
    } else if (SHELL.test(name)) {
      hidden = shellScripts(name, args, bodies, cwd, seen);
    } else {
      hidden = name === 'make' ? makeScripts(args, cwd, seen) : fileScripts(name, args, cwd, seen);
    }
    return hidden.some(nested);
  }
}
