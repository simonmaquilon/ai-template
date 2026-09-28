// Helpers for the effect hook tests: a tool call runs the PreToolUse hook,
// what the command did, and the PostToolUse hook, in a throwaway repository
// that already has a first commit.

import assert from 'node:assert/strict';
import { hookFor, makeRepo, runClientHook } from './support.mjs';

const input = (dir, id, command) => ({ session_id: 'session', tool_use_id: id, cwd: dir, tool_input: { command } });
const hook = (client, event, repo, id, command, dir = repo.dir) =>
  runClientHook(client, hookFor(client, event, 'check-staging-effect.mjs'), repo, { input: input(dir, id, command) });
export const before = (client, repo, id, command, dir) => hook(client, 'PreToolUse', repo, id, command, dir);
export const after = (client, repo, id, command, dir) => hook(client, 'PostToolUse', repo, id, command, dir);

// Runs a tool call: the before hook, what the command did, and the after hook.
export function call(client, repo, id, command, effect, dir) {
  assert.equal(before(client, repo, id, command, dir).status, 0);
  effect();
  return after(client, repo, id, command, dir);
}

export function baseRepo(t) {
  const repo = makeRepo(t);
  repo.write('base.txt', 'base\n');
  repo.git('add', '--', '.gitignore', 'base.txt');
  repo.git('commit', '-q', '-m', 'base');
  return repo;
}
