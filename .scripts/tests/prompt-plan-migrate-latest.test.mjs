// A plan created with the 7.0.1 helpers migrates to the bundled ones, and a customized copy of one of them is refused.

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT } from './support.mjs';
import { ALL, BUNDLE, setup, show } from './prompt-plan-migrate-fixture.mjs';

test('migrate a plan created with the 7.0.1 helpers, and refuse one of them customized', (t) => {
  const fixture = setup(t, { commit: 'cc1d024', helpers: ALL });
  if (!fixture) return;
  const { plan, migrate } = fixture;
  writeFileSync(join(plan, 'check', 'lib.mjs'), `${show('cc1d024', 'check-lib.mjs')}// customized\n`);
  const custom = migrate();
  assert.notEqual(custom.status, 0);
  assert.match(custom.stderr, /customized.*check\/lib\.mjs/i);
  assert.equal(readFileSync(join(plan, 'check', 'state.mjs'), 'utf8'), show('cc1d024', 'check-state.mjs'), 'no helper replaced');
  writeFileSync(join(plan, 'check', 'lib.mjs'), show('cc1d024', 'check-lib.mjs'));
  const result = migrate();
  assert.equal(result.status, 0, result.stderr);
  for (const [path, bundled] of Object.entries(ALL)) assert.deepEqual(readFileSync(join(plan, path)), readFileSync(join(ROOT, BUNDLE, bundled)), path);
  assert.equal(migrate().status, 0);
});
