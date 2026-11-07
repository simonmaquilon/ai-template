#!/usr/bin/env node
// Enforces the approval rule of AGENTS.md on git pushes that overwrite or
// delete remote refs, before a shell command runs: it reads the agent client's
// hook input and, when destructive-push.mjs finds such a push in the command,
// asks for the user's confirmation. Claude Code gets that as a permission
// decision on stdout; with --deny, which the Codex hook passes because Codex
// does not support asking and would run the command, the reason goes to stderr
// with exit status 2. A command nested too deep to read is asked about or
// rejected the same way. A plain push, or a command without one, passes
// silently. Commands are read as the staging hook reads them: shell-commands.mjs
// splits the text as the shell would, so a commit message or an echoed mention
// is never read as a command; PowerShell quoting applies when the client names
// that tool, and with --powershell, which the Codex hook passes on Windows, the
// command is read both ways. tool_input.command may arrive as text or as an
// argument list, and input.cwd sets where configuration, aliases, and script
// files are read. A command that starts in another repository, such as an
// independent project nested in this one, is left alone unless it may reach
// this one by changing directory or naming a repository.

import { destructivePush } from './destructive-push.mjs';
import { governed, readHookInput } from './hook-support.mjs';

const input = await readHookInput();
const readings = input?.tool_name === 'PowerShell' ? [true] : process.argv.includes('--powershell') ? [true, false] : [false];
const cwd = typeof input?.cwd === 'string' ? input.cwd : process.cwd();
const text = [input?.tool_input?.command ?? []].flat().join(' ');
let found;
let message;
try {
  found = destructivePush(input?.tool_input?.command, { readings, cwd });
  message = `AGENTS.md: this git push ${found}, which overwrites or deletes remote refs; it needs the user's explicit authorization.`;
} catch {
  found = 'unreadable';
  message = 'AGENTS.md: the push guard could not read this command; split it into simpler commands.';
}
if (found && governed(text, cwd)) {
  if (process.argv.includes('--deny')) {
    console.error(message);
    process.exit(2);
  }
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: message } }));
}
