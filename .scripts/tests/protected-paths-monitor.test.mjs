import assert from 'node:assert/strict';
import test from 'node:test';
import { postToolContext } from './hook-context.mjs';
import { after, before, project, reason, silent } from './protected-paths-fixture.mjs';

const MONITOR = { tool_name: 'Monitor' };
const SOCKET = { tool_name: 'Monitor', tool_input: { ws: { url: 'wss://example.invalid/feed' } } };

// Claude Code's Monitor tool runs its command in the shell the Bash tool uses and passes it as tool_input.command, or
// watches a WebSocket named in tool_input.ws and runs no shell at all.
test('claude: the protected-paths hook judges a Monitor command as the Bash one before it runs', (t) => {
  const repo = project(t);
  for (const command of ['rm .scripts/x', 'echo x > docs/a.md', 'tail -f log | tee config/a.json', 'bash -c "rm docs/a.md"', 'git checkout -- docs']) {
    const asked = reason('claude', before('claude', repo, command), command);
    assert.match(asked, /^AGENTS\.md: this command writes /, command);
    assert.equal(reason('claude', before('claude', repo, command, MONITOR), command), asked, command);
  }
  for (const command of ['tail -f .scripts/a.mjs', 'git status', 'echo x > src/a.ts']) silent(before('claude', repo, command, MONITOR), command);
});

test('claude: after a Monitor command the protected-paths hook names what changed, as after a Bash one', (t) => {
  const repo = project(t);
  silent(before('claude', repo, 'node watch.mjs', MONITOR), 'before');
  repo.write('docs/a.md', 'changed by the monitored program\n');
  assert.match(postToolContext(after('claude', repo, 'node watch.mjs', MONITOR)), /^AGENTS\.md: the shell command that just ran changed paths .*docs\/a\.md \(changed\)\./);
});

test('claude: a Monitor without a command passes the protected-paths hook in silence, before and after', (t) => {
  const repo = project(t);
  silent(before('claude', repo, undefined, SOCKET), 'before');
  silent(after('claude', repo, undefined, SOCKET), 'after');
  repo.write('docs/a.md', 'changed\n');
  silent(before('claude', repo, undefined, SOCKET), 'before again');
  silent(before('claude', repo, undefined, { ...SOCKET, tool_use_id: 't2' }), 'second call');
});
