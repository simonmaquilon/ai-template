import assert from 'node:assert/strict';
import test from 'node:test';
import { ciState } from '../release-ci.mjs';
import { fakeGh, withEnv } from './fake-gh.mjs';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const done = (conclusion) => ({ status: 'completed', conclusion, workflowName: 'ci' });
const ACTIVE = [{ name: 'ci', state: 'active' }];

const CASES = [
  ['pending', { runs: [done('success'), { status: 'in_progress', conclusion: '', workflowName: 'e2e' }] }],
  ['pending', { runs: [{ status: 'queued', conclusion: '', workflowName: 'ci' }, done('failure')] }],
  ['failed', { runs: [done('success'), done('failure')] }],
  ['failed', { runs: [done('cancelled')] }],
  ['failed', { runs: [done('timed_out')] }],
  ['passed', { runs: [done('success'), done('skipped'), done('neutral')] }],
  ['inactive', { runs: [], workflows: [] }],
  ['none', { runs: [], workflows: ACTIVE }],
  ['unknown', { fail: ['run list'] }],
  ['unknown', { runs: 'not json at all' }],
  ['unknown', { runs: { status: 'completed' } }],
  ['unknown', { runs: [], fail: ['workflow list'] }],
  ['unknown', { runs: [], workflows: 'not json at all' }],
];

for (const [state, config] of CASES) {
  test(`ciState gives ${state} for ${JSON.stringify(config)}`, (t) => {
    const gh = fakeGh(t, config);
    assert.equal(withEnv(gh.vars, () => ciState(SHA)), state);
  });
}

test('ciState asks gh about the whole commit and lists the workflows only when the commit has no run', (t) => {
  const gh = fakeGh(t, { runs: [done('success')] });
  withEnv(gh.vars, () => ciState(SHA));
  assert.deepEqual(gh.calls(), [['run', 'list', '--commit', SHA, '--json', 'status,conclusion,workflowName', '--limit', '100']]);
  const empty = fakeGh(t, { runs: [], workflows: ACTIVE });
  withEnv(empty.vars, () => ciState(SHA));
  assert.deepEqual(empty.calls().map((call) => call.slice(0, 2).join(' ')), ['run list', 'workflow list']);
  assert.deepEqual(empty.calls()[1], ['workflow', 'list', '--json', 'name,state']);
});

test('ciState gives unknown when there is no gh to run', (t) => {
  const gh = fakeGh(t, { runs: [done('success')] });
  assert.equal(withEnv(gh.missing, () => ciState(SHA)), 'unknown');
});
