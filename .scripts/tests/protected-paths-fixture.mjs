// Helpers for the protected-paths hook tests: a committed throwaway project whose .claude/settings.json lists the
// paths to protect, and runners that start the hook as each client registers it, before and after a command.

import assert from 'node:assert/strict';
import { hookFor, runClientHook, startRepo } from './support.mjs';

// Rules the hook reads and rules it leaves out: not one path from the root, or a Write rule, which Claude Code never matches.
export const SETTINGS = {
  permissions: {
    deny: ['Edit(.agents/tool-versions.json)', 'Edit(/.codex/**)', 'Edit(./config/)', 'Write(extra)', 'Edit(src/*.ts)', 'Edit(//etc/hosts)', 'Edit(~/notes)',
      'Edit(**/secrets.txt)', 'Edit(C:/x/y)', 'Bash(sudo *)', 'Read(.hidden)'],
  },
  sandbox: { filesystem: { denyWrite: ['.scripts', 'docs/', '/var/lib', '~/.ssh', 'lib/*.js'] } },
};
export const PROTECTED = ['.agents/tool-versions.json', '.codex', 'config', '.scripts', 'docs'];

export function project(t, settings = SETTINGS) {
  const repo = startRepo(t, { '.agents/tool-versions.json': '{}\n', '.codex/hooks.json': '{}\n', 'config/a.json': '{}\n', 'docs/a.md': 'a\n',
    'sub/.scripts/x.mjs': 'x\n', 'src/a.ts': 'a\n' });
  if (settings) repo.write('.claude/settings.json', typeof settings === 'string' ? settings : JSON.stringify(settings));
  return repo;
}

const base = (repo, command, extra) => ({ cwd: repo.dir, tool_name: 'Bash', tool_input: { command }, session_id: 's1', tool_use_id: 't1', ...extra });

export const before = (client, repo, command, { cwd = repo.dir, ...extra } = {}) =>
  runClientHook(client, hookFor(client, 'PreToolUse', 'check-protected-paths.mjs'), repo, { cwd, input: base(repo, command, { cwd, ...extra }) });
export const after = (client, repo, command, { cwd = repo.dir, ...extra } = {}) =>
  runClientHook(client, hookFor(client, 'PostToolUse', 'check-protected-paths.mjs'), repo, { cwd, input: base(repo, command, { cwd, ...extra }) });

export const silent = (result, label) => assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', ''], label);

// The reason of a command Claude Code is asked about, or Codex rejects with exit status 2.
export function reason(client, result, label) {
  if (client === 'claude') {
    assert.equal(result.status, 0, `${label}: ${result.stderr}`);
    assert.equal(result.stderr, '', label);
    const { hookEventName, permissionDecision, permissionDecisionReason } = JSON.parse(result.stdout).hookSpecificOutput;
    assert.deepEqual([hookEventName, permissionDecision], ['PreToolUse', 'ask'], label);
    return permissionDecisionReason;
  }
  assert.equal(result.status, 2, `${label}: ${result.stdout}${result.stderr}`);
  assert.equal(result.stdout, '', label);
  return result.stderr.trim();
}
