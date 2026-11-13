// Helpers for the write-scope hook tests: a committed throwaway repository as the project, folders beside it that
// stand in for the system temporary folder, an outside folder, and the Claude Code configuration folder, and a runner
// that starts the hook as each client registers it for a matcher, with that environment.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, WINDOWS, run, startRepo } from './support.mjs';

const CONFIGS = { claude: '.claude/settings.json', codex: '.codex/hooks.json' };
const SCRIPT = 'check-write-scope.mjs';

// The hook a client registers for this script in the PreToolUse group whose matcher is exactly `matcher`.
export function scopeHook(client, matcher) {
  const groups = JSON.parse(readFileSync(join(ROOT, CONFIGS[client]), 'utf8')).hooks.PreToolUse ?? [];
  const hook = groups.filter((group) => group.matcher === matcher).flatMap((group) => group.hooks)
    .find((candidate) => JSON.stringify(candidate).includes(SCRIPT));
  if (!hook) throw new Error(`${client} has no PreToolUse ${matcher} hook for ${SCRIPT}`);
  return hook;
}

export function scope(t) {
  const repo = startRepo(t);
  const beside = (name) => {
    const dir = mkdtempSync(join(ROOT, '.temp', `hook-${name}-`));
    t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
    return realpathSync.native(dir);
  };
  const tmp = beside('tmp');
  const outside = beside('ext');
  const config = beside('config');
  const env = { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp, CLAUDE_CONFIG_DIR: config };
  for (const name of ['CLAUDE_PROJECT_DIR', 'CLAUDE_CODE_TMPDIR', 'CLAUDE_CODE_PROJECT_DIR_NAME']) delete env[name];
  // Claude Code spawns the exec form with the project folder substituted and exported; Codex runs the command
  // through cmd.exe on Windows and a POSIX shell elsewhere, in the turn's folder.
  const fire = (client, matcher, input, cwd = repo.dir) => {
    const hook = scopeHook(client, matcher);
    const stdin = typeof input === 'string' ? input : JSON.stringify({ cwd, ...input });
    if (client === 'claude') {
      const args = hook.args.map((arg) => arg.replace('${CLAUDE_PROJECT_DIR}', repo.dir));
      return run(hook.command, args, { cwd, input: stdin, env: { ...env, CLAUDE_PROJECT_DIR: repo.dir } });
    }
    if (WINDOWS) {
      return run(env.ComSpec ?? 'cmd.exe', ['/C', `"${hook.commandWindows}"`], { cwd, input: stdin, env, windowsVerbatimArguments: true });
    }
    return run('/bin/sh', ['-c', hook.command], { cwd, input: stdin, env });
  };
  return { repo, tmp, outside, config, env, fire };
}

// The decision a PreToolUse hook printed, or null when it stayed silent.
export function decision(result, label) {
  assert.equal(result.status, 0, `${label}: ${result.stderr}`);
  assert.equal(result.stderr, '', label);
  if (result.stdout === '') return null;
  const output = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(output), ['hookSpecificOutput'], label);
  const { hookEventName, permissionDecision, permissionDecisionReason, ...rest } = output.hookSpecificOutput;
  assert.equal(hookEventName, 'PreToolUse', label);
  assert.deepEqual(rest, {}, label);
  assert.match(permissionDecisionReason, /^03-code-authoring\.md: /, label);
  return { decision: permissionDecision, reason: permissionDecisionReason };
}

export const assertSilent = (result, label) => assert.equal(decision(result, label), null, label);

export function assertDenied(result, label) {
  const found = decision(result, label);
  assert.equal(found?.decision, 'deny', label);
  assert.match(found.reason, /\.temp/, label);
  return found.reason;
}

export function assertAsked(result, label) {
  const found = decision(result, label);
  assert.equal(found?.decision, 'ask', label);
  return found.reason;
}
