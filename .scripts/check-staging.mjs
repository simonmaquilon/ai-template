#!/usr/bin/env node
// Enforces the staging rule of 27-version-control.md before a shell command
// runs: it reads the agent client's hook input and rejects, with exit status 2
// and the reason on stderr, a command that bulk-staging.mjs finds staging or
// committing in bulk, or one that nests too deep to read. shell-commands.mjs
// splits the command as the shell would, so a commit message, an echoed
// mention, or a comment is never read as a command, while a command
// substitution inside it, which the shell runs, is checked. PowerShell quoting
// applies when the client names that tool. With --powershell, which the Codex
// hook passes on Windows, where its Bash tool may run the command through
// PowerShell, the command is read both ways and rejected when either reading
// finds bulk staging. tool_input.command may arrive as text or as an argument
// list, and input.cwd sets where aliases, script files, and makefiles are read.

import { isBulk } from './bulk-staging.mjs';
import { readHookInput } from './hook-support.mjs';

const input = await readHookInput();
const readings = input?.tool_name === 'PowerShell' ? [true] : process.argv.includes('--powershell') ? [true, false] : [false];
const cwd = typeof input?.cwd === 'string' ? input.cwd : process.cwd();
let bulk;
try {
  bulk = isBulk(input?.tool_input?.command, { readings, cwd });
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
