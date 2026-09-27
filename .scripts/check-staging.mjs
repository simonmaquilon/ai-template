#!/usr/bin/env node
// Enforces the staging rule of 27-version-control.md before a shell command
// runs: with --hook it reads the agent client's hook input and rejects, with
// exit status 2 and the reason on stderr, a command that stages or commits in
// bulk: git add or git stage with -A, --all, -u, --update, a short-option
// cluster that includes -A or -u, or a whole-tree pathspec (., ./, ./*, .., ../,
// :/, or *), and git commit with -a, --all, a short-option cluster that
// includes -a after argument-less flags, such as -am or -qam, or a whole-tree
// pathspec. shell-commands.mjs splits the command as the shell would, so a
// commit message, an echoed mention, or a comment is never read as a command;
// PowerShell quoting applies when the client names that tool. Shell keywords,
// environment assignments, wrappers such as env or sudo and their options, and
// git global options may precede git, and a script a shell runs with -c, reads
// from a here-document, or receives through eval is checked the same way.
// tool_input.command may arrive as text or as an argument list.

import { readHookInput } from './hook-support.mjs';
import { commands } from './shell-commands.mjs';

const GIT = /^(?:.*[\\/])?git(?:\.exe)?$/i;
const SHELL = /^(?:.*[\\/])?(?:(?:ba|z|k|da)?sh|pwsh|powershell)(?:\.exe)?$/i;
const KEYWORDS = new Set(['!', '{', '}', 'if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until']);
const WRAPPERS = new Set(['command', 'env', 'exec', 'nohup', 'sudo', 'time']);
const WHOLE_TREE = new Set(['.', './', './*', '..', '../', ':/', '*']);
const GLOBAL_VALUES = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env']);
const VALUE_OPTIONS = new Set(['-m', '-F', '-C', '-c', '-t', '--message', '--file', '--author', '--date', '--template',
  '--reuse-message', '--reedit-message', '--fixup', '--squash', '--trailer', '--cleanup', '--chmod', '--pathspec-from-file']);

const wholeTree = (path) => WHOLE_TREE.has(path.replace(/\\/g, '/'));

// Whether git arguments, global options included, stage or commit in bulk.
function bulkGit(args) {
  let i = 0;
  while (args[i]?.startsWith('-')) i += GLOBAL_VALUES.has(args[i]) ? 2 : 1;
  const subcommand = args[i];
  const bulkOption =
    subcommand === 'commit'
      ? (arg) => arg === '--all' || /^-[einopqsvz]*a/.test(arg)
      : (arg) => arg === '--all' || arg === '--update' || /^-[a-zA-Z]*[Au][a-zA-Z]*$/.test(arg);
  if (subcommand !== 'add' && subcommand !== 'stage' && subcommand !== 'commit') return false;
  for (let j = i + 1; j < args.length; j++) {
    const arg = args[j];
    if (arg === '--') return args.slice(j + 1).some(wholeTree);
    if (VALUE_OPTIONS.has(arg)) j++;
    else if (arg.startsWith('-') ? bulkOption(arg) : wholeTree(arg)) return true;
  }
  return false;
}

function bulkCommand(words, bodies, powershell) {
  let i = 0;
  while (i < words.length) {
    if (/^\w+=/.test(words[i]) || KEYWORDS.has(words[i])) i++;
    else if (WRAPPERS.has(words[i])) for (i++; words[i]?.startsWith('-'); ) i += /^-[ug]$/.test(words[i]) ? 2 : 1;
    else break;
  }
  const [name, ...args] = words.slice(i);
  if (name === 'eval') return bulkScript(args.join(' '), powershell);
  if (name !== undefined && SHELL.test(name)) {
    const nested = /pwsh|powershell/i.test(name);
    const flag = args.findIndex((arg) => (nested ? /^-c(?:ommand)?$/i : /^-[a-zA-Z]*c[a-zA-Z]*$/).test(arg));
    const scripts = flag === -1 ? bodies : [args[args[flag + 1] === '--' ? flag + 2 : flag + 1] ?? ''];
    return scripts.some((script) => bulkScript(script, nested));
  }
  return name !== undefined && GIT.test(name) && bulkGit(args);
}

function bulkScript(script, powershell) {
  return commands(script, { powershell }).some(({ words, bodies }) => bulkCommand(words, bodies, powershell));
}

const input = await readHookInput();
const command = input?.tool_input?.command;
const powershell = input?.tool_name === 'PowerShell';
const bulk = Array.isArray(command) ? bulkCommand(command.map(String), [], false) : bulkScript(String(command ?? ''), powershell);
if (bulk) {
  console.error(
    '27-version-control.md: stage the authorized change by explicit paths; bulk staging can sweep in uncommitted work from another session.',
  );
  process.exit(2);
}
