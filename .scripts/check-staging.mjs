#!/usr/bin/env node
// Enforces the staging rule of 27-version-control.md before a shell command
// runs: it reads the agent client's hook input and rejects, with exit status 2
// and the reason on stderr, a command that stages or commits in bulk: git add
// or git stage with -A, --all, -u, --update, a short-option cluster that
// includes -A or -u, a whole-tree pathspec (., ./, ./*, .., ../, :/, or *), only
// exclude pathspecs, or no pathspec, as when xargs or $( ... ) supplies them,
// and git commit with -a, --all, a short-option cluster that includes -a after
// argument-less flags, such as -am or -qam, a whole-tree pathspec, or only
// exclude pathspecs. Paths xargs supplies to git add or git stage count as
// bulk, and so does --pathspec-from-file=- when reading them from input. A dry
// run stages nothing and an interactive git add (-p, -i, -e, or their long
// forms) stages only what is chosen, so both pass, unless a pipe or redirection
// answers the prompts for it.
// shell-commands.mjs splits the command as the shell would, so a commit
// message, an echoed mention, or a comment is never read as a command, while a
// command substitution inside it, which the shell runs, is checked.
// PowerShell quoting applies when the client names that tool or passes
// --powershell, as the Codex hook does on Windows, where Codex runs the command
// of its Bash tool through PowerShell. Shell keywords,
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

// Whether git arguments, global options included, stage or commit in bulk;
// fed marks input from a pipe or redirection, and xargs paths it supplies.
function bulkGit(args, fed, xargs) {
  let i = 0;
  while (args[i]?.startsWith('-')) i += GLOBAL_VALUES.has(args[i]) ? 2 : 1;
  const staging = args[i] === 'add' || args[i] === 'stage';
  if (!staging && args[i] !== 'commit') return false;
  if (staging && xargs) return true;
  const options = [];
  const paths = [];
  for (let j = i + 1; j < args.length; j++) {
    if (args[j] === '--') {
      paths.push(...args.slice(j + 1));
      break;
    }
    if (VALUE_OPTIONS.has(args[j])) options.push(`${args[j]}=${args[++j] ?? ''}`);
    else (args[j].startsWith('-') ? options : paths).push(args[j]);
  }
  if (options.includes('--dry-run')) return false;
  const interactive = (option) => /^--(?:patch|interactive|edit)$|^-[a-zA-Z]*[pie][a-zA-Z]*$/.test(option);
  if (staging && options.some((option) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(option) || (!fed && interactive(option)))) return false;
  const bulkOption = staging
    ? (option) => option === '--all' || option === '--update' || /^-[a-zA-Z]*[Au][a-zA-Z]*$/.test(option)
    : (option) => option === '--all' || /^-[einopqsvz]*a/.test(option);
  const excludeOnly = paths.length > 0 && paths.every((path) => /^:(?:!|\^|\(exclude\))/.test(path));
  const listed = options.some((option) => /^--pathspec-from-file=(?!-$)./.test(option));
  return options.some(bulkOption) || paths.some(wholeTree) || excludeOnly || (staging && paths.length === 0 && !listed);
}

function bulkCommand(words, bodies, powershell, fed) {
  let i = 0;
  while (i < words.length) {
    if (words[i] === 'xargs') {
      const git = words.findIndex((word, k) => k > i && GIT.test(word));
      return git !== -1 && bulkGit(words.slice(git + 1), true, true);
    }
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
  return name !== undefined && GIT.test(name) && bulkGit(args, fed, false);
}

function bulkScript(script, powershell) {
  return commands(script, { powershell }).some(({ words, bodies, fed }) => bulkCommand(words, bodies, powershell, fed));
}

const input = await readHookInput();
const command = input?.tool_input?.command;
const powershell = input?.tool_name === 'PowerShell' || process.argv.includes('--powershell');
let bulk;
try {
  bulk = Array.isArray(command) ? bulkCommand(command.map(String), [], false, false) : bulkScript(String(command ?? ''), powershell);
} catch {
  console.error('27-version-control.md: the staging guard could not read this command; split it into simpler commands.');
  process.exit(2);
}
if (bulk) {
  console.error(
    '27-version-control.md: stage the authorized change by explicit paths; bulk staging can sweep in uncommitted work from another session.',
  );
  process.exit(2);
}
