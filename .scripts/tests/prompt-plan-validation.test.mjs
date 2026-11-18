import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyRequiredE2E, missingCompiledTests } from '../../.agents/skills/prompt-plan/scripts/node/check-validation.mjs';

const target = { spec: 'tests/dialog.spec.ts', id: 'opens the dialog' };
const known = { ...target, signature: 'Timed out after 60000ms waiting for navigation' };
const attempt = (status, more = {}) => ({ ...target, status, ...more });
const verify = (results, { complete = true, retry = [] } = {}) => verifyRequiredE2E({
  required: [target], results, complete, known: [known], retry,
});

test('a missing, unexecuted, cancelled, duplicate, or incomplete required case cannot pass', () => {
  assert.equal(verify([attempt('passed')]).ok, true);
  for (const results of [[], [attempt('not-run')], [attempt('cancelled')], [attempt('skipped')], [attempt('passed'), attempt('passed')]]) {
    assert.equal(verify(results).ok, false);
  }
  assert.equal(verify([attempt('passed')], { complete: false }).ok, false);
  assert.equal(verifyRequiredE2E({ required: [], results: [], complete: true }).ok, false);
});

test('classify an exact intermittent signature and name the real spec instead of a stack frame', () => {
  const retry = [attempt('passed')];
  const network = attempt('failed', { signature: 'ECONNRESET', location: 'tests/support/auth.ts' });
  assert.deepEqual(verify([network], { retry }).issues, [{ ...target, result: 'failed' }]);
  const original = attempt('failed', { signature: known.signature });
  assert.deepEqual(verify([original]).issues, [{ ...target, result: 'failed' }]);
  assert.deepEqual(verify([original], { retry }).issues, [{ ...target, result: 'intermittent' }]);
  assert.equal(verify([original], { retry }).ok, false);
});

test('effective compilation must include changed spec and test support paths', () => {
  const changed = ['tests/dialog.spec.ts', 'tests/support/auth.ts', 'src/page.spec.ts'];
  assert.deepEqual(missingCompiledTests(changed, ['tests\\dialog.spec.ts']), ['tests/support/auth.ts', 'src/page.spec.ts']);
  assert.deepEqual(missingCompiledTests(changed, changed), []);
});
