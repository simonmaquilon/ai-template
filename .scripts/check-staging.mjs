#!/usr/bin/env node
// Enforces the staging rule of 27-version-control.md before a shell command
// runs: with --hook it reads the agent client's hook input and rejects, with
// exit status 2 and the reason on stderr, a command that stages or commits in
// bulk (git add or git stage with -A, --all, -u, --update, a short-option
// cluster that includes -A or -u, ., ./, .., :/, or *, and git commit with -a,
// --all, or a short-option cluster that includes -a, such as -am or -qam), also
// when global options such as -C <path>, -c <name>=<value>, or --no-pager
// precede the subcommand, and inside the script a shell runs with -c or eval.
// Here-document bodies and other quoted text, such as a commit message, are not
// inspected, except a quoted pathspec that is itself one of the bulk ones.
// tool_input.command may arrive as text or as an argument list.

import { readHookInput } from './hook-support.mjs';

const GIT = String.raw`git(?:\s+(?:-[Cc]\s+(?:"[^"]*"|'[^']*'|\S+)|--[\w-]+(?:=\S+)?))*\s+`;
const END = String.raw`(?=[\s;&|)<>\x60]|$)`;
const BULK = new RegExp(
  String.raw`${GIT}(?:add|stage)\s+([^|;&]*\s)?(-[a-zA-Z]*[Au][a-zA-Z]*|--all|--update|\.{1,2}\/?|:\/|\*)${END}|` +
    String.raw`${GIT}commit\s+([^|;&]*\s)?(-[einopqsvz]*a[a-zA-Z]*|--all)${END}`,
);
const HEREDOC = /(<<-?[ \t]*(['"]?)(\w+)\2[^\n]*)\n(?:[\s\S]*?\n)?[ \t]*\3[ \t]*(?=\n|$)/g;
const QUOTED = /"(?:[^"\\]|\\.)*"|'[^']*'/g;
const SCRIPT = /(?:\b(?:(?:ba|z|k|da)?sh|pwsh|powershell)(?:\.exe)?(?:\s+-\w+)*\s+-\w*c\w*|\beval)\s+("(?:[^"\\]|\\.)*"|'[^']*')/gi;
const PATHSPEC = /^(?:\.{1,2}\/?|:\/|\*)$/;

function isBulk(command) {
  const text = command.replace(HEREDOC, '$1');
  for (const [, quoted] of text.matchAll(SCRIPT)) if (isBulk(quoted.slice(1, -1))) return true;
  return BULK.test(text.replace(QUOTED, (quoted) => (PATHSPEC.test(quoted.slice(1, -1)) ? quoted.slice(1, -1) : '""')));
}

const input = await readHookInput();
const command = input.tool_input?.command;
if (isBulk(Array.isArray(command) ? command.join(' ') : String(command ?? ''))) {
  console.error(
    '27-version-control.md: stage the authorized change by explicit paths; bulk staging can sweep in uncommitted work from another session.',
  );
  process.exit(2);
}
