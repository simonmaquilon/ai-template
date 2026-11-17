import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { hookFor, makeRepo, run, runClientHook } from './support.mjs';

const SCRIPT = 'check-destructive-push.mjs';

// Claude Code's Monitor tool runs its command in the shell the Bash tool uses and passes it as tool_input.command, or
// watches a WebSocket named in tool_input.ws and runs no shell at all.
test('claude: the destructive-push guard judges a Monitor command as the Bash one, and a Monitor without a command passes', (t) => {
  const repo = makeRepo(t);
  const hook = hookFor('claude', 'PreToolUse', 'check-destructive-push.mjs');
  const fire = (tool_name, tool_input) => {
    const { status, stdout, stderr } = runClientHook('claude', hook, repo, { input: { cwd: repo.dir, tool_name, tool_input } });
    return { status, stdout, stderr };
  };
  for (const command of ['git push --force', 'git push origin ":old"', 'git push origin "+main"']) {
    const bash = fire('Bash', { command });
    assert.equal(JSON.parse(bash.stdout).hookSpecificOutput.permissionDecision, 'ask', command);
    assert.deepEqual(fire('Monitor', { command }), bash, command);
    // Codex has no ask, so its hook passes --deny: the same command is rejected there, as for Bash.
    const denied = (tool_name) => {
      const { status, stdout, stderr } = run(process.execPath, [join(repo.dir, '.scripts', SCRIPT), '--hook', '--deny'], { cwd: repo.dir, input: JSON.stringify({ cwd: repo.dir, tool_name, tool_input: { command } }) });
      return { status, stdout, stderr };
    };
    assert.equal(denied('Bash').status, 2, command);
    assert.deepEqual(denied('Monitor'), denied('Bash'), command);
  }
  for (const command of ['git push origin main', 'git status', 'tail -f build.log']) {
    const bash = fire('Bash', { command });
    assert.deepEqual([bash.status, bash.stdout, bash.stderr], [0, '', ''], command);
    assert.deepEqual(fire('Monitor', { command }), bash, command);
  }
  const socket = fire('Monitor', { ws: { url: 'wss://example.invalid/feed' } });
  assert.deepEqual([socket.status, socket.stdout, socket.stderr], [0, '', '']);
});
