// Resolves what a command runs beyond its own text, for the staging hooks: the
// definition of a git alias, from the repository configuration or a -c option;
// the script a shell runs with -c or -Command, from a file, including one given
// to PowerShell with -File, or from a here-document; a script file sourced or
// run by path; and the recipe lines of the make targets invoked, prerequisites
// included. Each function returns the scripts to check as { script, powershell }
// pairs and only reads; a file or make target already read in the same walk,
// a file it cannot read, or one over MAX_BYTES yields nothing.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { git } from './hook-support.mjs';

const MAX_BYTES = 1024 * 1024;
const MAKEFILES = ['GNUmakefile', 'makefile', 'Makefile'];
const RULE = /^([^\t#\s][^:=]*?)\s*::?(?!=)\s*([^;]*)(?:;(.*))?$/;
const CONDITIONAL = /^\s*(?:ifeq|ifneq|ifdef|ifndef|else|endif)\b/;
const SHELL_VALUES = new Set(['-o', '+o', '-O', '+O', '--rcfile', '--init-file']);
const PWSH_VALUES = new Set(['-executionpolicy', '-ep', '-ex', '-workingdirectory', '-wd', '-configurationname', '-inputformat', '-outputformat', '-windowstyle', '-settingsfile']);
const quote = (arg) => `'${arg.replace(/'/g, `'\\''`)}'`;
let builtins = null;

function read(path) {
  try {
    return existsSync(path) && statSync(path).isFile() && statSync(path).size <= MAX_BYTES ? readFileSync(path, 'utf8') : null;
  } catch {
    return null;
  }
}

// Whether key was already read in this walk, marking it read otherwise.
function repeated(seen, key) {
  if (seen.has(key)) return true;
  seen.add(key);
  return false;
}

// The alias a git subcommand names, expanded with the rest of its arguments.
export function aliasScripts(globals, subcommand, rest, cwd) {
  if (!subcommand || subcommand.startsWith('-')) return [];
  builtins ??= new Set((git(['--list-cmds=builtins']) ?? '').split('\n').filter(Boolean));
  if (builtins.has(subcommand)) return [];
  const inline = globals.map((option) => /^alias\.([^=]+)=(.*)$/s.exec(option)).find((match) => match?.[1] === subcommand);
  const value = inline?.[2] ?? git(['-C', cwd, 'config', '--get', `alias.${subcommand}`])?.trim();
  if (!value) return [];
  const args = rest.map(quote).join(' ');
  return [{ script: value.startsWith('!') ? `${value.slice(1)} ${args}` : `git ${value} ${args}`, powershell: false }];
}

// The script a shell runs: after -c or -Command, from a file, or from input.
export function shellScripts(name, args, bodies, cwd, seen) {
  const powershell = /pwsh|powershell/i.test(name);
  let file = null;
  for (let i = 0; i < args.length && file === null; i++) {
    const arg = args[i];
    if (powershell ? /^-c(?:ommand)?$/i.test(arg) : /^-[a-zA-Z]*c[a-zA-Z]*$/.test(arg)) {
      return [{ script: args[args[i + 1] === '--' ? i + 2 : i + 1] ?? '', powershell }];
    }
    if (powershell && /^-f(?:ile)?$/i.test(arg)) file = args[i + 1] ?? '';
    else if (powershell ? PWSH_VALUES.has(arg.toLowerCase()) : SHELL_VALUES.has(arg)) i++;
    else if (!/^[-+]/.test(arg)) file = arg;
  }
  return [...bodies.map((script) => ({ script, powershell })), ...(file ? fileScripts('source', [file], cwd, seen) : [])];
}

// The file a command sources, or the command itself when run by its path.
export function fileScripts(name, args, cwd, seen) {
  const path = name === 'source' || name === '.' ? args[0] : /[\\/]/.test(name) ? name : null;
  const full = path ? resolve(cwd, path.replace(/\\/g, '/')) : null;
  const text = full && !repeated(seen, full) ? read(full) : null;
  return text === null ? [] : [{ script: text, powershell: /\.ps1$/i.test(path) }];
}

// The recipe lines make runs for the targets it is asked for.
export function makeScripts(args, cwd, seen) {
  let dir = cwd;
  let file = null;
  const targets = [];
  for (let i = 0; i < args.length; i++) {
    const directory = /^(?:-C|--directory=?)(.*)$/.exec(args[i]);
    const makefile = /^(?:-f|--file=?|--makefile=?)(.*)$/.exec(args[i]);
    if (directory) dir = resolve(dir, directory[1] || args[++i] || '');
    else if (makefile) file = makefile[1] || args[++i];
    else if (!args[i].startsWith('-') && !args[i].includes('=')) targets.push(args[i]);
  }
  const path = file ? resolve(dir, file) : MAKEFILES.map((name) => join(dir, name)).find((candidate) => existsSync(candidate));
  const text = path && !repeated(seen, `${path}#${targets.join(' ')}`) ? read(path) : null;
  if (text === null) return [];
  const rules = new Map();
  let current = null;
  let first = null;
  for (const line of text.replace(/\\\r?\n/g, ' ').split(/\r?\n/)) {
    const rule = line.startsWith('\t') || CONDITIONAL.test(line) ? null : RULE.exec(line);
    if (rule) {
      current = rule[1].split(/\s+/).filter(Boolean);
      for (const target of current) {
        if (!rules.has(target)) rules.set(target, { prerequisites: [], recipe: [] });
        rules.get(target).prerequisites.push(...rule[2].split(/\s+/).filter(Boolean));
        if (rule[3]?.trim()) rules.get(target).recipe.push(rule[3].trim());
      }
      first ??= current.find((target) => !target.startsWith('.')) ?? null;
    } else if (line.startsWith('\t') && current) {
      for (const target of current) rules.get(target).recipe.push(line.slice(1).replace(/^[@+-]+/, ''));
    } else if (line.trim() !== '' && !line.startsWith('#') && !CONDITIONAL.test(line)) {
      current = null;
    }
  }
  const lines = [];
  const visit = (target, visited) => {
    if (visited.has(target) || !rules.has(target)) return;
    visited.add(target);
    for (const prerequisite of rules.get(target).prerequisites) visit(prerequisite, visited);
    for (const line of rules.get(target).recipe) lines.push(line);
  };
  const visited = new Set();
  for (const target of targets.length > 0 ? targets : [first]) visit(target, visited);
  return lines.length > 0 ? [{ script: lines.join('\n'), powershell: false }] : [];
}
