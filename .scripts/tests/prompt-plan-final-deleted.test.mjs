// A check script deleted from a fragment that keeps its build file and has a saved run stays in the final inventory as
// missing, so the final run cannot pass without it; a fragment that never had a check, or no longer has its build file, adds none.

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { makePlan } from './prompt-plan-cache-plan.mjs';

const LOG = (number) => `${number}-check-2026-11-19T00-00-00-000Z.log`;
const evidence = (plan) => JSON.parse(readFileSync(join(plan, 'review', 'final-run.json'), 'utf8'));

test('prompt-plan final: a deleted check of a fragment with a build file and a saved run is missing, and the run is incomplete', (t) => {
  const { all, plan } = makePlan(t);
  mkdirSync(join(plan, 'build'));
  mkdirSync(join(plan, 'review'), { recursive: true });
  writeFileSync(join(plan, 'build', '05-never.md'), '# 05\n');
  writeFileSync(join(plan, 'review', LOG('06')), 'a run of a fragment whose build file is gone\n');
  writeFileSync(join(plan, 'review', '05-check-fix-2026-11-19T00-00-00-000Z.log'), 'evidence, not a run\n');
  const kept = all(['--final']);
  assert.equal(kept.status, 0, `${kept.stdout}${kept.stderr}`);
  assert.deepEqual(evidence(plan).fragments.map(({ number, status }) => [number, status]), [['01', 'passed'], ['02', 'passed'], ['03', 'passed']]);
  writeFileSync(join(plan, 'build', '04-gone.md'), '# 04\n');
  writeFileSync(join(plan, 'review', LOG('04')), 'a saved run of the deleted check\n');
  const missing = all(['--final']);
  assert.equal(missing.status, 1, `${missing.stdout}${missing.stderr}`);
  assert.match(missing.stderr, /Fragment 04: missing regular check script/);
  assert.deepEqual(evidence(plan).fragments.map(({ number, status }) => [number, status]),
    [['01', 'passed'], ['02', 'passed'], ['03', 'passed'], ['04', 'missing']]);
  assert.equal(evidence(plan).status, 'incomplete');
});

test('prompt-plan final: the check fingerprint holds the deleted check, so the plan does not look as one that never had it', async (t) => {
  const { check, plan } = makePlan(t);
  const { checkFingerprint } = await import(pathToFileURL(join(check, 'state.mjs')).href);
  mkdirSync(join(plan, 'build'));
  mkdirSync(join(plan, 'review'), { recursive: true });
  writeFileSync(join(plan, 'build', '04-gone.md'), '# 04\n');
  const never = checkFingerprint(plan);
  writeFileSync(join(plan, 'review', LOG('04')), 'a saved run\n');
  assert.notEqual(checkFingerprint(plan), never);
});
