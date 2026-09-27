#!/usr/bin/env node
// Enforces the staging rule of 27-version-control.md before a shell command
// runs: with --hook it reads the agent client's hook input and rejects, with
// exit status 2 and the reason on stderr, a command that stages or commits in
// bulk (git add or git stage with -A, --all, -u, --update, a short-option
// cluster that includes -A or -u, ., ./, :/, or *, and git commit with -a,
// --all, or a short-option cluster that includes -a, such as -am or -qam), also
// when global options such as -C <path>, -c <name>=<value>, or --no-pager
// precede the subcommand. Quoted text and here-document bodies, such as a
// commit message, are not inspected. tool_input.command may arrive as text or
// as an argument list.

import { readHookInput } from './hook-support.mjs';

const GIT = String.raw`git(?:\s+(?:-[Cc]\s+(?:"[^"]*"|'[^']*'|\S+)|--[\w-]+(?:=\S+)?))*\s+`;
const END = String.raw`(?=\s|$|[;&|)])`;
const BULK = new RegExp(
  String.raw`${GIT}(?:add|stage)\s+([^|;&]*\s)?(-[a-zA-Z]*[Au][a-zA-Z]*|--all|--update|\.\/?|:\/|\*)${END}|` +
    String.raw`${GIT}commit\s+([^|;&]*\s)?(-[b-ln-zA-Z]*a[a-zA-Z]*|--all)${END}`,
);
const HEREDOC = /<<-?[ \t]*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?:\n|$)/g;
const QUOTED = /"(?:[^"\\]|\\.)*"|'[^']*'/g;

const input = await readHookInput();
const command = input.tool_input?.command;
const text = Array.isArray(command) ? command.join(' ') : String(command ?? '');
if (BULK.test(text.replace(HEREDOC, '\n').replace(QUOTED, '""'))) {
  console.error(
    '27-version-control.md: stage the authorized change by explicit paths; bulk staging can sweep in uncommitted work from another session.',
  );
  process.exit(2);
}
