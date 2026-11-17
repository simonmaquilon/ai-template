// The instruction check measures AGENTS.md against a 10 KB limit, and the template's own AGENTS.md leaves room
// under it for the routing entries a derived project adds.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, makeRepo } from './support.mjs';

const LIMIT = 10 * 1024;
const ROUTING_ROOM = 1024;

function agentsOf(size) {
  const head = '- `01-meta.md`: meta.\n\n';
  return head + 'y'.repeat(size - Buffer.byteLength(head));
}

test('instruction check: an AGENTS.md of exactly 10240 bytes is not reported', (t) => {
  const repo = makeRepo(t);
  repo.write('AGENTS.md', agentsOf(LIMIT));
  repo.write('.agents/instructions/01-meta.md', '# Meta\n');
  const result = repo.script('check-instructions.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /AGENTS\.md over/);
});

test('instruction check: an AGENTS.md of 10241 bytes is reported', (t) => {
  const repo = makeRepo(t);
  repo.write('AGENTS.md', agentsOf(LIMIT + 1));
  repo.write('.agents/instructions/01-meta.md', '# Meta\n');
  const result = repo.script('check-instructions.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /AGENTS\.md over 10240 bytes \(01-meta-guidelines\.md\): 10241 bytes/);
});

test('the template AGENTS.md leaves at least 1024 bytes under the limit', () => {
  const bytes = readFileSync(join(ROOT, 'AGENTS.md')).length;
  assert.ok(bytes <= LIMIT - ROUTING_ROOM, `AGENTS.md holds ${bytes} bytes, over ${LIMIT - ROUTING_ROOM}`);
});
