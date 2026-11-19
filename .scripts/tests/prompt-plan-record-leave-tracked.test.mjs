import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { holds, patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const refused = (result, pattern) => {
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, pattern);
};

test('record after leaves a tracked foreign file out of its patch and retains staged and unstaged changes through revert and apply', (t) => {
  const repo = startRepo(t, { 'mine.txt': 'before\n', '[foreign].txt': 'original\n' });
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  writeFileSync(join(plan, 'build', '01-step.md'), '# 01\n\n<!-- write-path: mine.txt -->\n');
  ok(patch('record', '01', 'before'));
  repo.write('mine.txt', 'fragment work\n');
  repo.write('[foreign].txt', 'staged foreign work\n');
  ok(repo.git('add', '--', '[foreign].txt'));
  repo.write('[foreign].txt', 'unstaged foreign work\n');
  const index = readFileSync(join(repo.dir, '.git', 'index'));

  refused(patch('record', '01', 'after', '--leave', '[foreign].txt'), /--leave names files the index tracks/);
  const recorded = patch('record', '01', 'after', '--leave-tracked', '[foreign].txt');
  ok(recorded);
  assert.match(recorded.stdout, /tracked[^\n]*left[\s\S]*\[foreign\]\.txt/i);
  const state = JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8'));
  assert.deepEqual(Object.keys(state.files), ['mine.txt']);
  assert.doesNotMatch(readFileSync(join(plan, 'patch', '01.patch'), 'utf8'), /foreign/);
  assert.equal(holds(repo, plan, 'unstaged foreign work\n'), false);

  ok(patch('record', '02', 'before'));
  ok(patch('record', '02', 'after'));
  ok(patch('revert', 'all'));
  assert.equal(readFileSync(join(repo.dir, 'mine.txt'), 'utf8'), 'before\n');
  ok(patch('apply', 'all'));
  assert.equal(readFileSync(join(repo.dir, 'mine.txt'), 'utf8'), 'fragment work\n');
  assert.equal(readFileSync(join(repo.dir, '[foreign].txt'), 'utf8'), 'unstaged foreign work\n');
  assert.deepEqual(readFileSync(join(repo.dir, '.git', 'index')), index);
});

test('record restore reinstates fragment work while leaving a foreign tracked edit on disk and in the index', (t) => {
  const repo = startRepo(t, { 'mine.txt': 'before\n', 'foreign.txt': 'original\n' });
  const { plan, patch } = patchPlan(repo, ['01']);
  writeFileSync(join(plan, 'build', '01-step.md'), '# 01\n\n<!-- write-path: mine.txt -->\n');
  ok(patch('record', '01', 'before'));
  repo.write('mine.txt', 'fragment work\n');
  repo.write('foreign.txt', 'staged foreign work\n');
  ok(repo.git('add', '--', 'foreign.txt'));
  repo.write('foreign.txt', 'unstaged foreign work\n');
  const index = readFileSync(join(repo.dir, '.git', 'index'));

  ok(patch('record', '01', 'restore', '--leave-tracked', 'foreign.txt'));
  assert.equal(readFileSync(join(repo.dir, 'mine.txt'), 'utf8'), 'before\n');
  assert.equal(readFileSync(join(repo.dir, 'foreign.txt'), 'utf8'), 'unstaged foreign work\n');
  assert.equal(holds(repo, plan, 'unstaged foreign work\n'), false);
  assert.deepEqual(readFileSync(join(repo.dir, '.git', 'index')), index);
});

test('tracked exclusions refuse owned paths, unsafe paths, and either endpoint of an incomplete rename before writing', (t) => {
  const repo = startRepo(t, { 'earlier.txt': 'one\n', 'scope/mine.txt': 'origin\n', 'old.txt': 'old\n' });
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('earlier.txt', 'earlier work\n');
  ok(patch('record', '01', 'after'));
  writeFileSync(join(plan, 'build', '02-step.md'), '# 02\n\n<!-- write-path: scope -->\n');
  ok(patch('record', '02', 'before'));
  ok(repo.git('mv', 'old.txt', 'new.txt'));
  repo.write('scope/mine.txt', 'fragment work\n');
  repo.write('earlier.txt', 'new edit\n');
  const index = readFileSync(join(repo.dir, '.git', 'index'));

  for (const phase of ['after', 'restore']) {
    refused(patch('record', '02', phase, '--leave-tracked', 'scope/mine.txt'), /--leave-tracked.*fragment 02/i);
    refused(patch('record', '02', phase, '--leave-tracked', 'earlier.txt'), /--leave-tracked.*earlier fragment 01/i);
    for (const name of ['old.txt', 'new.txt', '../old.txt', '.git/index', 'scope']) {
      refused(patch('record', '02', phase, '--leave-tracked', name), /--leave-tracked/);
    }
  }
  assert.equal(readFileSync(join(repo.dir, 'scope', 'mine.txt'), 'utf8'), 'fragment work\n');
  assert.equal(readFileSync(join(repo.dir, 'new.txt'), 'utf8'), 'old\n');
  assert.equal(existsSync(join(plan, 'patch', '02.state')), false);
  assert.deepEqual(readFileSync(join(repo.dir, '.git', 'index')), index);
});

test('tracked exclusions are refused before writing by a fragment that declares no write path, and accepted once it declares them', (t) => {
  const repo = startRepo(t, { 'mine.txt': 'before\n', 'foreign.txt': 'original\n' });
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('mine.txt', 'fragment work\n');
  repo.write('foreign.txt', 'foreign work\n');
  const index = readFileSync(join(repo.dir, '.git', 'index'));

  for (const phase of ['after', 'restore']) {
    // An owned file would be accepted as foreign while nothing says what the fragment owns.
    for (const name of ['mine.txt', 'foreign.txt']) refused(patch('record', '01', phase, '--leave-tracked', name), /write-path/);
  }
  assert.equal(readFileSync(join(repo.dir, 'mine.txt'), 'utf8'), 'fragment work\n');
  assert.equal(readFileSync(join(repo.dir, 'foreign.txt'), 'utf8'), 'foreign work\n');
  assert.deepEqual(readdirSync(join(plan, 'patch')).filter((name) => /^01\.(patch|state)$/.test(name)), []);
  assert.deepEqual(readFileSync(join(repo.dir, '.git', 'index')), index);

  writeFileSync(join(plan, 'build', '01-step.md'), '# 01\n\n<!-- write-path: mine.txt -->\n');
  ok(patch('record', '01', 'after', '--leave-tracked', 'foreign.txt'));
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8')).files), ['mine.txt']);
});
