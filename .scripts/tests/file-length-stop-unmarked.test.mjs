// The turn-end pass of check-file-length.mjs for a session whose turn has no marker, because no turn-start pass
// ran: the brake has no turn to count blocks in, so the stop behaves as one without a session id and writes no state.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { makeRepo, numbered } from './support.mjs';

test('a stop with a session id but no turn marker lets a continued stop end, blocks every other one, and keeps no state', (t) => {
  const repo = makeRepo(t);
  repo.write('big.go', numbered(151));
  const run = (active) => repo.script('check-file-length.mjs', ['--hook'], JSON.stringify({ session_id: 's1', stop_hook_active: active }));
  for (let i = 0; i < 5; i++) {
    const blocked = run(false);
    assert.equal(blocked.status, 2, `stop ${i + 1} not continued`);
    assert.match(blocked.stderr, /big\.go \(151 lines, new\)/);
  }
  assert.equal(run(true).status, 0, 'a continued stop ends');
  assert.equal(existsSync(join(repo.dir, '.temp', 'check-file-length', 's1.stop')), false);
});
