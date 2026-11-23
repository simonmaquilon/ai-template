#!/usr/bin/env node
// Keeps a call from confining a command that the client settings exempt from the sandbox (04-validation-and-testing.md),
// before the call runs: it reads the agent client's hook input and the sandbox of .claude/settings.json and
// .claude/settings.local.json, whose excludedCommands lists are joined, and rejects, with exit status 2 and the
// reason on stderr, a call whose commands would match an exemption once the forms that keep them in the sandbox
// are removed, since the exemption then does not apply and the command fails as if it had none, chaining included, even
// of exempt commands only. It says the exact form to run and where to read the output. A call that is the exact exempt
// form, one with no exempt command and one that sets dangerouslyDisableSandbox, which the sandbox does not confine at
// all, pass. Without an active sandbox or a list, and on any input or settings it cannot read, it stays silent. exempt-command.mjs reads the call, and a sandbox exemption has no Codex equivalent, so
// only Claude Code registers it.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitCommand } from './exempt-command.mjs';
import { isExempt } from './exempt-match.mjs';
import { governed, readHookInput } from './hook-support.mjs';

const CLAUDE = join(dirname(fileURLToPath(import.meta.url)), '..', '.claude');
const FORMS = {
  redirection: 'a redirection', pipe: 'a pipe', chain: 'command chaining', env: 'a leading environment variable',
  cd: 'a directory change', prefix: 'a sudo, eval, or xargs prefix', substitution: 'a command substitution', subshell: 'a subshell',
  block: 'a control block or group',
};

const sandboxOf = (file) => {
  try {
    return JSON.parse(readFileSync(join(CLAUDE, file), 'utf8'))?.sandbox ?? {};
  } catch {
    return {};
  }
};

// The exemption patterns in force: the lists of both files, only while the sandbox is on, the local file deciding that.
function exemptions() {
  const [shared, local] = [sandboxOf('settings.json'), sandboxOf('settings.local.json')];
  const lists = [shared, local].flatMap(({ excludedCommands }) => (Array.isArray(excludedCommands) ? excludedCommands : []));
  return (local.enabled ?? shared.enabled) === true ? lists.filter((pattern) => typeof pattern === 'string') : [];
}

const input = await readHookInput();
try {
  const command = input?.tool_input?.command;
  const patterns = typeof command === 'string' && input.tool_input.dangerouslyDisableSandbox !== true ? exemptions() : [];
  if (patterns.length === 0) process.exit(0);
  const { segments, forms } = splitCommand(command, { powershell: input.tool_name === 'PowerShell' });
  const hits = segments.filter((segment) => isExempt(patterns, segment));
  if (forms.size === 0 || hits.length === 0 || !governed(command, typeof input.cwd === 'string' ? input.cwd : process.cwd())) process.exit(0);
  const exact = hits.map((hit) => `\`${hit}\``).join(' and ');
  console.error(
    `04-validation-and-testing.md: ${exact} is exempt from the sandbox only when run alone, in that exact form, and ${[...forms].map((form) => FORMS[form]).join(', ')} `
      + `keeps this call confined, so it fails as it would without the exemption. Run exactly ${exact}, never redirected, piped, chained, or prefixed, `
      + "and read its output from the background task's output or from the log its script writes.",
  );
  process.exit(2);
} catch {
  process.exit(0);
}
