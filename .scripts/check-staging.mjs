#!/usr/bin/env node
// Enforces the staging rule of 27-version-control.md before a shell command
// runs: with --hook it reads the agent client's hook input and rejects, with
// exit status 2 and the reason on stderr, a command that stages or commits in
// bulk (git add with -A, --all, -u, --update, or ., and git commit with -a,
// --all, or -am). tool_input.command may arrive as text or as an argument list.

import { readHookInput } from './hook-support.mjs';

const BULK = /git\s+add\s+([^|;&]*\s)?(-A|--all|-u|--update|\.)(\s|$)|git\s+commit\s+([^|;&]*\s)?(-a|--all|-am)(\s|$)/;

const input = await readHookInput();
const command = input.tool_input?.command;
const text = Array.isArray(command) ? command.join(' ') : String(command ?? '');
if (BULK.test(text)) {
  console.error(
    '27-version-control.md: stage the authorized change by explicit paths; bulk staging can sweep in uncommitted work from another session.',
  );
  process.exit(2);
}
