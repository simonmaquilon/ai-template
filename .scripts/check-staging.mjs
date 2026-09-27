#!/usr/bin/env node
// Enforces the staging rule of 27-version-control.md before a shell command
// runs: with --hook it reads the agent client's hook input and rejects, with
// exit status 2 and the reason on stderr, a command that stages or commits in
// bulk: git add or git stage with -A, --all, -u, --update, a short-option
// cluster that includes -A or -u, or a whole-tree pathspec (., ./, .., ../, :/,
// or *), and git commit with -a, --all, a short-option cluster that includes -a
// after argument-less flags, such as -am or -qam, or a whole-tree pathspec.
// The command is split the way a shell splits it: at ;, &, |, parentheses,
// backquotes, $(, and line ends, with quotes removed, so a commit message or an
// echoed mention is never read as a command. Global options such as -C <path>,
// -c <name>=<value>, or --no-pager, environment assignments, and wrappers such
// as env or sudo may precede git. A script a shell runs with -c, reads from a
// here-document, or receives through eval is checked the same way.
// tool_input.command may arrive as text or as an argument list.

import { readHookInput } from './hook-support.mjs';

const GIT = /^(?:.*[\\/])?git(?:\.exe)?$/i;
const SHELL = /^(?:.*[\\/])?(?:(?:ba|z|k|da)?sh|pwsh|powershell)(?:\.exe)?$/i;
const WRAPPERS = new Set(['command', 'env', 'exec', 'nohup', 'sudo', 'time']);
const SEPARATORS = new Set([';', '&', '|', '(', ')', '`']);
const WHOLE_TREE = new Set(['.', './', '..', '../', ':/', '*']);
const VALUE_OPTIONS = new Set(['-m', '-F', '-C', '-c', '-t', '--message', '--file', '--author', '--date', '--template',
  '--reuse-message', '--reedit-message', '--fixup', '--squash', '--trailer', '--cleanup', '--chmod', '--pathspec-from-file']);

// Splits a script into simple commands, each with its unquoted words and the
// bodies of the here-documents it opens.
function commands(script) {
  const found = [];
  let words = [];
  let word = null;
  let bodies = [];
  let delimiters = [];
  const endWord = () => {
    if (word !== null) words.push(word);
    word = null;
  };
  const endCommand = () => {
    endWord();
    if (words.length > 0) found.push({ words, bodies });
    words = [];
    bodies = [];
  };
  for (let i = 0; i < script.length; i++) {
    const c = script[i];
    if (c === '\\') {
      if (script[i + 1] !== '\n') word = (word ?? '') + (script[i + 1] ?? '');
      i++;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      let text = '';
      while (j < script.length && script[j] !== c) {
        if (c === '"' && script[j] === '\\') j++;
        text += script[j++] ?? '';
      }
      word = (word ?? '') + text;
      i = j;
    } else if (c === '<' && script[i + 1] === '<' && script[i + 2] !== '<') {
      endWord();
      const match = /^<<-?[ \t]*(['"]?)(\w+)\1/.exec(script.slice(i));
      if (match) delimiters.push(match[2]);
      i += match ? match[0].length - 1 : 1;
    } else if (c === '\n') {
      for (const delimiter of delimiters) {
        const lines = [];
        while (i < script.length) {
          const next = script.indexOf('\n', i + 1);
          const line = script.slice(i + 1, next === -1 ? undefined : next);
          i = next === -1 ? script.length : next;
          if (line.trim() === delimiter) break;
          lines.push(line);
        }
        bodies.push(lines.join('\n'));
      }
      delimiters = [];
      endCommand();
    } else if (SEPARATORS.has(c) || (c === '$' && script[i + 1] === '(')) {
      endCommand();
    } else if (c === ' ' || c === '\t' || c === '\r' || c === '<' || c === '>') {
      endWord();
    } else {
      word = (word ?? '') + c;
    }
  }
  endCommand();
  return found;
}

// Whether git arguments, global options included, stage or commit in bulk.
function bulkGit(args) {
  let i = 0;
  while (args[i]?.startsWith('-')) i += /^-[Cc]$/.test(args[i]) ? 2 : 1;
  const subcommand = args[i];
  const bulkOption =
    subcommand === 'commit'
      ? (arg) => arg === '--all' || /^-[einopqsvz]*a/.test(arg)
      : (arg) => arg === '--all' || arg === '--update' || /^-[a-zA-Z]*[Au][a-zA-Z]*$/.test(arg);
  if (subcommand !== 'add' && subcommand !== 'stage' && subcommand !== 'commit') return false;
  for (let j = i + 1; j < args.length; j++) {
    const arg = args[j];
    if (arg === '--') return args.slice(j + 1).some((path) => WHOLE_TREE.has(path));
    if (VALUE_OPTIONS.has(arg)) j++;
    else if (arg.startsWith('-') ? bulkOption(arg) : WHOLE_TREE.has(arg)) return true;
  }
  return false;
}

function bulkCommand(words, bodies) {
  let i = 0;
  while (/^\w+=/.test(words[i] ?? '') || WRAPPERS.has(words[i])) i++;
  const [name, ...args] = words.slice(i);
  if (name === 'eval') return bulkScript(args.join(' '));
  if (name !== undefined && SHELL.test(name)) {
    const script = /pwsh|powershell/i.test(name) ? /^-c(?:ommand)?$/i : /^-[a-zA-Z]*c[a-zA-Z]*$/;
    const flag = args.findIndex((arg) => script.test(arg));
    const scripts = flag === -1 ? bodies : [args[args[flag + 1] === '--' ? flag + 2 : flag + 1] ?? ''];
    return scripts.some(bulkScript);
  }
  return name !== undefined && GIT.test(name) && bulkGit(args);
}

function bulkScript(script) {
  return commands(script).some(({ words, bodies }) => bulkCommand(words, bodies));
}

const input = await readHookInput();
const command = input.tool_input?.command;
if (Array.isArray(command) ? bulkCommand(command.map(String), []) : bulkScript(String(command ?? ''))) {
  console.error(
    '27-version-control.md: stage the authorized change by explicit paths; bulk staging can sweep in uncommitted work from another session.',
  );
  process.exit(2);
}
