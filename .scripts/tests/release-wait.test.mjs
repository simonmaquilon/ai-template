import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForCi } from '../release-wait.mjs';

// A state function that answers from a list, repeating the last answer, and records the commit of each call.
function sequence(...answers) {
  const state = (sha) => {
    state.shas.push(sha);
    return answers[Math.min(state.shas.length - 1, answers.length - 1)];
  };
  state.shas = [];
  return state;
}
const wait = (state, options = {}) => waitForCi('abc', { state, interval: 1, grace: 100, limit: 10000, ...options });

test('waitForCi returns at the first passed, inactive, or failed state without waiting', async () => {
  for (const answer of ['passed', 'inactive', 'failed']) {
    const state = sequence(answer, 'pending');
    assert.equal(await wait(state, { interval: 60000 }), answer);
    assert.deepEqual(state.shas, ['abc']);
  }
});

test('waitForCi keeps polling the commit while the CI is pending', async () => {
  const state = sequence('pending', 'pending', 'pending', 'passed');
  assert.equal(await wait(state), 'passed');
  assert.equal(state.shas.length, 4);
  assert.equal(await wait(sequence('pending', 'failed')), 'failed');
});

test('waitForCi gives up when none or unknown lasts for the whole grace period, however they alternate', async () => {
  const started = Date.now();
  assert.equal(await wait(sequence('none'), { grace: 150 }), 'unverified');
  assert.equal(await wait(sequence('unknown', 'none'), { grace: 50 }), 'unverified');
  assert.ok(Date.now() - started < 5000, 'it did not wait for the limit');
});

test('waitForCi restarts the grace period when a run appears, and gives up when it does not', async () => {
  // Counted from the first none the three of them last 30 ms, the grace period; counted from the pending one they do not.
  const answers = ['none', 'none', 'pending', 'none', 'none', 'passed'];
  const state = sequence(...answers);
  assert.equal(await wait(state, { grace: 30, interval: 10 }), 'passed');
  assert.equal(state.shas.length, 6);
  const withoutRun = sequence('none', 'none', 'none', 'none', 'none', 'passed');
  assert.equal(await wait(withoutRun, { grace: 30, interval: 10 }), 'unverified');
});

test('waitForCi stops at the limit while the CI stays pending', async () => {
  const state = sequence('pending');
  assert.equal(await wait(state, { limit: 60, interval: 5 }), 'timeout');
  assert.ok(state.shas.length > 1);
});
