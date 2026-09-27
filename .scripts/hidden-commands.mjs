// Resolves what a command runs beyond its own text, for the staging guard: the
// definition of a git alias, from the repository configuration or a -c option,
// a script file a shell runs, is sourced, or is run by path, and the recipe
// lines of the make targets invoked, prerequisites included. Each function
// returns the scripts to check, as { script, powershell } pairs, and only
// reads; a file it cannot read, or one over MAX_BYTES, yields nothing.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { git } from './hook-support.mjs';

const MAX_BYTES = 1024 * 1024;
const MAKEFILES = ['GNUmakefile', 'makefile', 'Makefile'];
const RULE = /^([^\t#\s][^:=]*?)\s*::?(?!=)\s*([^;]*)(?:;(.*))?$/;
let builtins = null;

function read(path) {
  try {
    return existsSync(path) && statSync(path).isFile() && statSync(path).size <= MAX_BYTES ? readFileSync(path, 'utf8') : null;
  } catch {
    return null;
  }
}

// The alias a git subcommand names, expanded with the rest of its arguments.
export function aliasScripts(globals, subcommand, rest, cwd) {
  if (!subcommand || subcommand.startsWith('-')) return [];
  builtins ??= new Set((git(['--list-cmds=builtins']) ?? '').split('\n').filter(Boolean));
  if (builtins.has(subcommand)) return [];
  const inline = globals.map((option) => /^alias\.([^=]+)=(.*)$/s.exec(option)).find((match) => match?.[1] === subcommand);
  const value = inline?.[2] ?? git(['-C', cwd, 'config', '--get', `alias.${subcommand}`])?.trim();
  if (!value) return [];
  const script = value.startsWith('!') ? `${value.slice(1)} ${rest.join(' ')}` : `git ${value} ${rest.join(' ')}`;
  return [{ script, powershell: false }];
}

// The file a shell runs or sources, or a command run by its path.
export function fileScripts(name, args, cwd) {
  const path = name === 'source' || name === '.' ? args[0] : /[\\/]/.test(name) ? name : null;
  const text = path ? read(resolve(cwd, path.replace(/\\/g, '/'))) : null;
  return text === null ? [] : [{ script: text, powershell: /\.ps1$/i.test(path) }];
}

// The recipe lines make runs for the targets it is asked for.
export function makeScripts(args, cwd) {
  let dir = cwd;
  let file = null;
  const targets = [];
  for (let i = 0; i < args.length; i++) {
    const option = /^(?:-C|--directory)(?:=(.*))?$|^(?:-f|--file|--makefile)(?:=(.*))?$/.exec(args[i]);
    if (option?.[0].startsWith('-C') || option?.[0].startsWith('--directory')) dir = resolve(dir, option[1] ?? args[++i] ?? '');
    else if (option) file = option[2] ?? args[++i];
    else if (!args[i].startsWith('-') && !args[i].includes('=')) targets.push(args[i]);
  }
  const path = file ? resolve(dir, file) : MAKEFILES.map((name) => join(dir, name)).find((candidate) => existsSync(candidate));
  const text = path ? read(path) : null;
  if (text === null) return [];
  const rules = new Map();
  let current = null;
  let first = null;
  for (const line of text.replace(/\\\r?\n/g, ' ').split(/\r?\n/)) {
    const rule = line.startsWith('\t') ? null : RULE.exec(line);
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
    } else if (line.trim() !== '' && !line.startsWith('#')) {
      current = null;
    }
  }
  const lines = [];
  const visit = (target, seen) => {
    if (seen.has(target) || !rules.has(target)) return;
    seen.add(target);
    for (const prerequisite of rules.get(target).prerequisites) visit(prerequisite, seen);
    lines.push(...rules.get(target).recipe);
  };
  const seen = new Set();
  for (const target of targets.length > 0 ? targets : [first]) visit(target, seen);
  return lines.length > 0 ? [{ script: lines.join('\n'), powershell: false }] : [];
}
