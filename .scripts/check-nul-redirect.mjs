#!/usr/bin/env node
// Keeps a POSIX shell command from creating a file called NUL (03-code-authoring.md), before the command runs: it
// reads the agent client's hook input and rejects, with exit status 2 and the reason on stderr, a command that
// nul-redirect.mjs finds redirecting output to NUL, since there it is an ordinary file name, not the null device,
// and the reason says to use /dev/null. It acts only on the Bash tool; PowerShell and cmd treat NUL as the null
// device. With --powershell, which the Codex hook passes on Windows, where its Bash tool may run the command through
// PowerShell, it stays silent. It deletes nothing, and its own errors never block the command. tool_input.command
// may arrive as text or as an argument list, and input.cwd sets where aliases and script files are read.

import { readHookInput } from './hook-support.mjs';
import { nulRedirect } from './nul-redirect.mjs';

const input = await readHookInput();
if ((input?.tool_name && input.tool_name !== 'Bash') || process.argv.includes('--powershell')) process.exit(0);
const cwd = typeof input?.cwd === 'string' ? input.cwd : process.cwd();
let found = null;
try {
  found = nulRedirect(input?.tool_input?.command, { cwd });
} catch {
  process.exit(0);
}
if (found) {
  console.error(
    `03-code-authoring.md: this command redirects output to ${JSON.stringify(found)}, which a POSIX shell treats as an ordinary file name, `
      + 'so it would create a file called NUL that Windows can hardly delete or version; redirect to /dev/null instead.',
  );
  process.exit(2);
}
