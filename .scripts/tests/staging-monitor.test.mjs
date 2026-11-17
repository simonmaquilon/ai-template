import assert from 'node:assert/strict';
import test from 'node:test';
import { hookFor, makeRepo, runClientHook } from './support.mjs';

// Claude Code's Monitor tool runs its command in the shell the Bash tool uses and passes it as tool_input.command, or
// watches a WebSocket named in tool_input.ws and runs no shell at all.
test('claude: the staging guard judges a Monitor command as the Bash one, and a Monitor without a command passes', (t) => {
  const repo = makeRepo(t);
  const hook = hookFor('claude', 'PreToolUse', 'check-bulk-staging.mjs');
  const fire = (tool_name, tool_input) => {
    const { status, stdout, stderr } = runClientHook('claude', hook, repo, { input: { cwd: repo.dir, tool_name, tool_input } });
    return { status, stdout, stderr };
  };
  // The last command is bulk only in the POSIX reading, which a PowerShell tool would not give it.
  for (const command of ['git add -A', 'git commit -am wip', 'cd docs && git add .', 'git commit -m "Fix `git add -A` handling"']) {
    const bash = fire('Bash', { command });
    assert.equal(bash.status, 2, command);
    assert.deepEqual(fire('Monitor', { command }), bash, command);
  }
  for (const command of ['git add README.md', 'git status', 'tail -f build.log']) {
    const bash = fire('Bash', { command });
    assert.deepEqual([bash.status, bash.stdout, bash.stderr], [0, '', ''], command);
    assert.deepEqual(fire('Monitor', { command }), bash, command);
  }
  const socket = fire('Monitor', { ws: { url: 'wss://example.invalid/feed' } });
  assert.deepEqual([socket.status, socket.stdout, socket.stderr], [0, '', '']);
});
