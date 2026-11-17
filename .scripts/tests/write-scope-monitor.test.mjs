import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDenied, assertSilent, scope } from './write-scope-fixture.mjs';

const SHELLS = 'Bash|PowerShell|Monitor';
const tool = (tool_name, tool_input) => ({ tool_name, tool_input });

// Claude Code's Monitor tool runs its command in the shell the Bash tool uses and passes it as tool_input.command, or
// watches a WebSocket named in tool_input.ws and runs no shell at all.
test('claude: the write-scope hook judges a Monitor command as the Bash one, and a Monitor without a command passes', (t) => {
  const { tmp, fire } = scope(t);
  for (const command of ['tail -f build.log > "$TMPDIR/x.txt"', 'echo hi >> $TMP/notes.md', `make 2>&1 | tee -a ${tmp.replaceAll('\\', '/')}/log.txt`, 'mktemp']) {
    const bash = fire('claude', SHELLS, tool('Bash', { command }));
    assert.equal(assertDenied(bash, command), assertDenied(fire('claude', SHELLS, tool('Monitor', { command })), command), command);
  }
  for (const command of ['tail -f build.log', 'echo hi > .temp/x.txt', 'git status']) assertSilent(fire('claude', SHELLS, tool('Monitor', { command })), command);
  assertSilent(fire('claude', SHELLS, tool('Monitor', { ws: { url: 'wss://example.invalid/feed' } })), 'ws');
});
