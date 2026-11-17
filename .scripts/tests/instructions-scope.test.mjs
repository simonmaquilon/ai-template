// The instruction check holds each routing entry of AGENTS.md to the scope line of its module: "Read " plus the
// entry's condition, as 01-meta-guidelines.md asks for entries that match the module's scope line.

import assert from 'node:assert/strict';
import test from 'node:test';
import { makeRepo } from './support.mjs';

const TITLE = 'Instruction files whose scope line differs from their routing entry in AGENTS.md (01-meta-guidelines.md)';

function check(t, entry, module) {
  const repo = makeRepo(t);
  if (entry !== null) repo.write('AGENTS.md', `# Agents\n\n${entry}\n`);
  repo.write('.agents/instructions/02-flow.md', module);
  const result = repo.script('check-instructions.mjs');
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('instruction check: a scope line that differs from its routing entry is reported by module', (t) => {
  const out = check(t, '- `02-flow.md`: before planning a change.', '# Flow\n\nRead before editing a change.\n\n- A rule.\n');
  assert.equal(out, `${TITLE}: 02-flow.md\n`);
});

test('instruction check: a scope line that is "Read " plus the entry condition is not reported', (t) => {
  assert.equal(check(t, '- `02-flow.md`: before planning a change.', '# Flow\n\nRead before planning a change.\n\n- A rule.\n'), '');
});

test('instruction check: a module without a scope line is reported, and one without an entry only as unrouted', (t) => {
  assert.equal(check(t, '- `02-flow.md`: before planning a change.', '# Flow\n\n- A rule.\n'), `${TITLE}: 02-flow.md\n`);
  const unrouted = check(t, null, '# Flow\n\nRead before planning a change.\n');
  assert.doesNotMatch(unrouted, /scope line/);
  assert.match(unrouted, /without a routing entry in AGENTS\.md \(01-meta-guidelines\.md\): 02-flow\.md/);
});
