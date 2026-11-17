import assert from 'node:assert/strict';
import test from 'node:test';
import { hookFor, makeRepo, runClientHook } from './support.mjs';

// Claude Code's Monitor tool runs its command in the shell the Bash tool uses and passes it as tool_input.command, or
// watches a WebSocket named in tool_input.ws and runs no shell at all.
test('claude: the NUL hook judges a Monitor command as the Bash one, and a Monitor without a command passes', (t) => {
  const repo = makeRepo(t);
  const hook = hookFor('claude', 'PreToolUse', 'check-nul-redirect.mjs');
  const fire = (tool_name, tool_input) => {
    const { status, stdout, stderr } = runClientHook('claude', hook, repo, { input: { cwd: repo.dir, tool_name, tool_input } });
    return { status, stdout, stderr };
  };
  for (const command of ['echo x > NUL', 'tail -f build.log 2>NUL', 'bash -c "x >> nul"']) {
    const bash = fire('Bash', { command });
    assert.equal(bash.status, 2, command);
    assert.match(bash.stderr, /^03-code-authoring\.md: /, command);
    assert.deepEqual(fire('Monitor', { command }), bash, command);
  }
  for (const command of ['echo x > /dev/null', 'tail -f build.log', 'echo NUL']) {
    const bash = fire('Bash', { command });
    assert.deepEqual([bash.status, bash.stdout, bash.stderr], [0, '', ''], command);
    assert.deepEqual(fire('Monitor', { command }), bash, command);
  }
  const socket = fire('Monitor', { ws: { url: 'wss://example.invalid/feed' } });
  assert.deepEqual([socket.status, socket.stdout, socket.stderr], [0, '', '']);
  // PowerShell reads NUL as the null device, so the hook still leaves that tool alone.
  assert.equal(fire('PowerShell', { command: 'dir 2>NUL' }).status, 0);
});
