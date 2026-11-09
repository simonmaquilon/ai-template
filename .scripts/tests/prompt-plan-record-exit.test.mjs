// What record NN after trusts in a check log: the exit status lib writes at the end of every log, no skipped line, and a
// stamp that is not in the future.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, patchPlan, startRepo } from './support.mjs';

const LIB = join(ROOT, '.agents', 'skills', 'prompt-plan', 'scripts', 'node', 'check-lib.mjs');
const PASS = "condition('A', 'passes', true)";

// A plan whose fragment 01 has its before record and a check made of body, which then runs with env.
function planWith(t, body, env = {}) {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01']);
  mkdirSync(join(plan, 'check'), { recursive: true });
  cpSync(LIB, join(plan, 'check', 'lib.mjs'));
  writeFileSync(join(plan, 'check', '01-check.mjs'), `import { condition, runChecks, slow } from './lib.mjs';\n${body}\n`);
  assert.equal(patch('record', '01', 'before').status, 0);
  const node = spawnSync(process.execPath, [join(plan, 'check', '01-check.mjs')], { cwd: repo.dir, encoding: 'utf8', env: { ...process.env, ...env } });
  const logs = () => readdirSync(join(plan, 'review')).filter((name) => name.endsWith('.log'));
  const after = () => {
    repo.write('kept.txt', 'after\n');
    return patch('record', '01', 'after');
  };
  return { plan, node, logs, after };
}

const refused = (planned, why) => {
  const result = planned.after();
  assert.notEqual(result.status, 0, why);
  assert.match(result.stderr, /01-check\.mjs/, why);
  assert.equal(existsSync(join(planned.plan, 'patch', '01.state')), false, why);
};

test('prompt-plan record: lib ends every log of a process with its exit status, and a passing run records', (t) => {
  const planned = planWith(t, `runChecks('01', [${PASS}]);`);
  const [log] = planned.logs();
  assert.ok(readFileSync(join(planned.plan, 'review', log), 'utf8').endsWith('\n## EXIT 0\n'));
  assert.equal(planned.after().status, 0);
});

test('prompt-plan record: a script that fails in a later group, throws after a passing group, or is killed is refused', (t) => {
  const failing = planWith(t, `runChecks('01', [condition('A', 'fails', false)]);\nrunChecks('01', [${PASS}]);`);
  assert.equal(failing.node.status, 1);
  assert.equal(failing.logs().length, 2);
  for (const name of failing.logs()) assert.ok(readFileSync(join(failing.plan, 'review', name), 'utf8').endsWith('\n## EXIT 1\n'), name);
  refused(failing, 'a later failing group');
  const thrown = planWith(t, `runChecks('01', [${PASS}]);\nthrow new Error('the server never answered');`);
  assert.equal(thrown.node.status, 1);
  refused(thrown, 'an error after a passing group');
  const killed = planWith(t, `runChecks('01', [${PASS}]);\nprocess.kill(process.pid, 'SIGKILL');`);
  assert.notEqual(killed.node.status, 0);
  refused(killed, 'a killed process leaves no exit status');
});

test('prompt-plan record: a log with a skipped line, or stamped in the future, is refused', (t) => {
  const skipped = planWith(t, `runChecks('01', [slow(${PASS})]);`, { PROMPT_PLAN_SKIP_SLOW: '1' });
  assert.equal(skipped.node.status, 0);
  assert.match(readFileSync(join(skipped.plan, 'review', skipped.logs()[0]), 'utf8'), /^## SKIPPED /m);
  refused(skipped, 'a log of an all run for a later fragment');
  const future = planWith(t, `runChecks('01', [${PASS}]);`);
  const [log] = future.logs();
  writeFileSync(join(future.plan, 'review', '01-check-2999-01-01T00-00-00-000Z.log'), readFileSync(join(future.plan, 'review', log), 'utf8'));
  refused(future, 'a stamp in the future');
});
