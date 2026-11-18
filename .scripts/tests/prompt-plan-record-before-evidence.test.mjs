import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { patchPlan, startRepo } from './support.mjs';

test('record before keeps its two legacy fields and appends the evidence snapshot for a plan with state capture', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01']);
  mkdirSync(join(plan, 'check'));
  writeFileSync(join(plan, 'check', 'state.mjs'), `export function captureProject(root, planDir) { return { basis: 'fixture', files: { root, planDir } }; }\nexport const declaredTestPaths = () => ['behavior.test.mjs'];\n`);
  const result = patch('record', '01', 'before');
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  const [tree, recordedRoot, project] = readFileSync(join(plan, 'patch', '01.before'), 'utf8').split('\n');
  assert.match(tree, /^[\da-f]+$/);
  assert.equal(recordedRoot, repo.git('rev-parse', '--show-toplevel').stdout.trim());
  assert.deepEqual(JSON.parse(project), { basis: 'fixture', files: { root: recordedRoot, planDir: join(recordedRoot, '.temp', 'plans', 'p') }, testPaths: ['behavior.test.mjs'] });
});

test('record before refuses unavailable project evidence without leaving either before record', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01']);
  mkdirSync(join(plan, 'check'));
  writeFileSync(join(plan, 'check', 'state.mjs'), 'export const captureProject = () => null;\n');
  const result = patch('record', '01', 'before');
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /before.*evidence/i);
  assert.equal(existsSync(join(plan, 'patch', '01.before')), false);
  assert.equal(existsSync(join(plan, 'patch', '01.untracked')), false);
});
