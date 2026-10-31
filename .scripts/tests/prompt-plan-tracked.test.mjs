// What prompt-plan's snapshots take from the repository's own index: never the plan's files, even tracked, and nothing
// from a repository that tracks nothing and has no commit, where only an adopted file is captured; a tracked file
// deleted from disk is absent, whatever the index holds, and a deleted file that revert wrote back while nothing tracks it
// any longer counts for what it holds, so apply deletes it again, while a file that holds something else there counts
// as absent: apply leaves it, and revert refuses with git's reason to write over it.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { makeRepo, patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const refused = (result, pattern) => {
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, pattern);
  assert.doesNotMatch(result.stderr, /^\s+at /m, 'the refusal carries a stack trace');
};
const state = (plan, number) => JSON.parse(readFileSync(join(plan, 'patch', `${number}.state`), 'utf8'));

test('prompt-plan tracked: plan files committed with the work stay out of the patch, and revert keeps them', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01'], {}, join('plans', 'p'));
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(repo.git('add', 'kept.txt', join('plans', 'p', 'build', '01-step.md'), join('plans', 'p', 'patch', 'record.mjs')));
  ok(repo.git('commit', '-q', '-m', 'fragment 01'));
  ok(patch('record', '01', 'after'));
  assert.deepEqual(Object.keys(state(plan, '01').files), ['kept.txt']);
  ok(patch('revert', '01'));
  assert.ok(existsSync(join(plan, 'build', '01-step.md')) && existsSync(join(plan, 'patch', 'record.mjs')));
});

test('prompt-plan tracked: a tracked file deleted from disk is absent, and revert brings it back', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'gone.txt': 'gone\n' });
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  rmSync(join(repo.dir, 'gone.txt'));
  ok(patch('record', '01', 'after'));
  assert.equal(state(plan, '01').files['gone.txt'].after, null);
  ok(patch('revert', '01'));
  assert.equal(readFileSync(join(repo.dir, 'gone.txt'), 'utf8'), 'gone\n');
});

test('prompt-plan tracked: a deleted file that revert wrote back, with its deletion committed, counts for what it holds', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'gone.txt': 'gone\n' });
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  rmSync(join(repo.dir, 'gone.txt'));
  ok(repo.git('commit', '-q', '-a', '-m', 'delete gone.txt'));
  ok(patch('record', '01', 'after'));
  const revert = patch('revert', '01');
  ok(revert);
  // Nothing tracks or adopts the file written back, which revert says, and the next run reads it all the same.
  assert.match(revert.stdout, /stay untracked; apply and revert count them by what they hold:\n {2}gone\.txt/);
  ok(patch('apply', '01'));
  assert.equal(existsSync(join(repo.dir, 'gone.txt')), false);
  ok(patch('revert', '01'));
  assert.equal(readFileSync(join(repo.dir, 'gone.txt'), 'utf8'), 'gone\n');
  repo.write('gone.txt', 'other\n');
  assert.match(patch('apply', '01').stdout, /already applied/);
  refused(patch('revert', '01'), /does not revert from the working tree[\s\S]*gone\.txt: already exists/);
  assert.equal(readFileSync(join(repo.dir, 'gone.txt'), 'utf8'), 'other\n');
});

test('prompt-plan tracked: a repository with no commit and nothing tracked captures only what is adopted', (t) => {
  const repo = makeRepo(t);
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('made.txt', 'made\n');
  repo.write('stray.txt', 'stray\n');
  ok(patch('record', '01', 'after', '--include', 'made.txt', '--leave', 'stray.txt'));
  assert.deepEqual(Object.keys(state(plan, '01').files), ['made.txt']);
  ok(patch('revert', '01'));
  assert.deepEqual([existsSync(join(repo.dir, 'made.txt')), existsSync(join(repo.dir, 'stray.txt'))], [false, true]);
  ok(patch('apply', '01'));
  assert.equal(readFileSync(join(repo.dir, 'made.txt'), 'utf8'), 'made\n');
});
