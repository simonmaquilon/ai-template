#!/usr/bin/env node
// Guards the paths a project protects against shell commands (AGENTS.md), which the Edit deny rules of
// permissions.deny never reach, and the sandbox only confines where the client has one. The list comes from
// .claude/settings.json and .claude/settings.local.json beside these scripts, as protected-paths.mjs reads them. It
// judges the command of Claude Code's Monitor tool as one of Bash, and a Monitor without a command, which watches a
// WebSocket, passes in silence. Before a command, it judges the
// command as shell-commands.mjs and staging-reader.mjs read it: one that writes a protected path in an evident way
// asks for the user's confirmation, as a permission decision on stdout for Claude Code; with --deny, which the Codex
// hook passes because Codex does not support asking, the reason goes to stderr with exit status 2. A command that
// does not write one passes silently, and so does a project whose settings file is missing or lists none; a settings
// file it cannot read, or a command nested too deep to read, asks or rejects the same way. With --powershell, which
// the Codex hook passes on Windows, the command is read both ways. Otherwise, a command that passes first leaves a
// fingerprint of the protected paths under .temp/protected-paths/, and with --after, which Claude Code registers for
// PostToolUse and for PostToolUseFailure, since a command that exits with an error fires only the latter, the hook
// compares it with the paths as they are and, when any changed by any means, tells the model, as additional context,
// to report the paths to the user. It never restores or deletes anything, and an error of its own after a command,
// or in saving the fingerprint, never blocks. A command that starts in another repository, such as an independent
// project nested in this one, is left alone unless it may reach this one by changing directory or naming a repository.

import { closeSync, constants, fstatSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { governed, readHookInput } from './hook-support.mjs';
import { protectedPaths, shellWrites } from './protected-paths.mjs';
import { differences, fingerprint, saveFingerprint, stateName, takeFingerprint } from './protected-paths-state.mjs';
import { inFolder, openRegular } from './safe-fs.mjs';

const RULE = 'AGENTS.md';
const SHOWN = 25;
const LIMIT = 1024 * 1024;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const input = await readHookInput();
const cwd = typeof input?.cwd === 'string' && isAbsolute(input.cwd) ? input.cwd : process.cwd();
const command = input?.tool_input?.command;
const text = [command ?? []].flat().join(' ');
const name = stateName(input);

// The text of the file `name` of .claude, read without following a link and without waiting on a pipe, or null when it
// is missing; throws when it is a link, not a regular file, or over 1 MiB, or when .claude is a link.
function settings(name) {
  const read = () => {
    let fd;
    try {
      fd = openRegular(name, constants.O_RDONLY);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    try {
      if (fstatSync(fd).size > LIMIT) throw new Error('too large');
      return readFileSync(fd, 'utf8');
    } finally {
      closeSync(fd);
    }
  };
  let text;
  try {
    text = inFolder(root, '.claude', false, read);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (text === undefined) throw new Error('.claude is a link');
  return text;
}

// The protected paths of .claude/settings.json and .claude/settings.local.json together, none when the project has no
// settings file; throws when settings.json cannot be read. A settings.local.json that is missing, unreadable, a link, too
// large, or not JSON adds nothing, without a word, since Claude Code already reports it.
function listed() {
  let local = null;
  try {
    local = settings('settings.local.json');
  } catch {}
  return protectedPaths(settings('settings.json') ?? '{}', local);
}

function stop(reason) {
  const message = `${RULE}: ${reason}`;
  if (process.argv.includes('--deny')) {
    console.error(message);
    process.exit(2);
  }
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: message } }));
  process.exit(0);
}

function before() {
  let paths;
  let found;
  try {
    paths = listed();
    const readings = input?.tool_name === 'PowerShell' ? [true] : process.argv.includes('--powershell') ? [true, false] : [false];
    const gitBash = process.platform === 'win32' && readings.length === 1 && !readings[0];
    found = paths.length > 0 ? shellWrites(command, { readings, cwd, root, paths, gitBash }) : null;
  } catch {
    if (governed(text, cwd)) stop('the protected-paths guard could not read this command or the list in .claude/settings.json; split the command into simpler ones or fix the settings.');
    return;
  }
  if (found && governed(text, cwd)) {
    stop(`this command writes ${JSON.stringify(found)}, which the project protects (permissions.deny or sandbox.filesystem.denyWrite in `
      + '.claude/settings.json or .claude/settings.local.json); changing it needs the user\'s explicit authorization.');
  }
  if (!name || paths.length === 0) return;
  try {
    saveFingerprint(root, name, fingerprint(root, paths));
  } catch {}
}

function after() {
  try {
    const paths = listed();
    const earlier = name && paths.length > 0 ? takeFingerprint(root, name) : null;
    const changed = earlier ? differences(earlier, fingerprint(root, paths)) : [];
    if (changed.length === 0) return;
    const more = changed.length > SHOWN ? `, and ${changed.length - SHOWN} more` : '';
    const context = `${RULE}: the shell command that just ran changed paths this project protects: ${changed.slice(0, SHOWN).join(', ')}${more}. `
      + 'Tell the user, in their language, which paths changed and by which command; do not restore or delete them, since whether to keep the change is the user\'s decision.';
    const hookEventName = input?.hook_event_name === 'PostToolUseFailure' ? 'PostToolUseFailure' : 'PostToolUse';
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: context } }));
  } catch {}
}

if (process.argv.includes('--after')) after();
else before();
