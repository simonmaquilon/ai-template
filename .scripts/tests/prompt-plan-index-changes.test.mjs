// Changes to the repository's index during a fragment never delete or add a file of the user's: a file git rm --cached
// takes out of the index while it stays on disk stops after, restore, and the next before record until git add tracks
// it again, since no patch can carry that change; a file untracked at before that the before snapshot lacks and git add
// stages stays out of after and restore, and later fragments capture it like any tracked file; after reports one staged
// in a folder held whole.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

function setUp(t, files, numbers = ['01']) {
  const repo = startRepo(t, { 'a.txt': 'a0\n', 'b.txt': 'b0\n', ...files });
  const { plan, patch } = patchPlan(repo, numbers);
  const state = (number) => JSON.parse(readFileSync(join(plan, 'patch', `${number}.state`), 'utf8'));
  const read = (path) => readFileSync(join(repo.dir, path), 'utf8');
  const patchText = (number) => readFileSync(join(plan, 'patch', `${number}.patch`), 'utf8');
  return { repo, plan, patch, state, read, patchText };
}

const OUT_OF_INDEX = /the index no longer tracks these files of [^\n]*, which stay on disk, and no patch can carry taking a file out of the index; track each again with git add -- <file>, with -f for an ignored one[^\n]*:\n {2}b\.txt/;
const refused = (result, pattern) => {
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, pattern);
  assert.doesNotMatch(result.stderr, /^\s+at /m, 'the refusal carries a stack trace');
};

test('prompt-plan index changes: record after refuses a file taken out of the index that stays on disk until git add tracks it again', (t) => {
  const { repo, plan, patch, state, read } = setUp(t);
  ok(patch('record', '01', 'before'));
  ok(repo.git('rm', '--cached', '-q', 'b.txt'));
  repo.write('b.txt', 'b-edited\n');
  repo.write('a.txt', 'a1\n');
  for (const extra of [[], ['--leave', 'b.txt']]) refused(patch('record', '01', 'after', ...extra), OUT_OF_INDEX);
  assert.equal(existsSync(join(plan, 'patch', '01.state')), false);
  ok(repo.git('add', 'b.txt'));
  ok(patch('record', '01', 'after'));
  assert.deepEqual(Object.keys(state('01').files).sort(), ['a.txt', 'b.txt']);
  ok(patch('revert', '01'));
  assert.deepEqual([read('a.txt'), read('b.txt')], ['a0\n', 'b0\n']);
  ok(patch('apply', '01'));
  assert.deepEqual([read('a.txt'), read('b.txt')], ['a1\n', 'b-edited\n']);
});

test('prompt-plan index changes: restore refuses, before writing, a file taken out of the index that stays on disk', (t) => {
  const { repo, patch, read } = setUp(t);
  ok(patch('record', '01', 'before'));
  ok(repo.git('rm', '--cached', '-q', 'b.txt'));
  repo.write('b.txt', 'b-edited\n');
  repo.write('a.txt', 'a1\n');
  refused(patch('record', '01', 'restore'), OUT_OF_INDEX);
  assert.deepEqual([read('a.txt'), read('b.txt')], ['a1\n', 'b-edited\n']);
  ok(repo.git('add', 'b.txt'));
  ok(patch('record', '01', 'restore'));
  assert.deepEqual([read('a.txt'), read('b.txt')], ['a0\n', 'b0\n']);
});

test('prompt-plan index changes: a fragment does not start while a file of the previous record stays on disk out of the index', (t) => {
  const { repo, plan, patch, state } = setUp(t, {}, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('a.txt', 'a1\n');
  ok(patch('record', '01', 'after'));
  ok(repo.git('rm', '--cached', '-q', 'b.txt'));
  refused(patch('record', '02', 'before'), OUT_OF_INDEX);
  assert.equal(existsSync(join(plan, 'patch', '02.before')), false);
  ok(repo.git('add', 'b.txt'));
  ok(patch('record', '02', 'before'));
  repo.write('b.txt', 'b-edited\n');
  ok(patch('record', '02', 'after'));
  assert.deepEqual(Object.keys(state('02').files), ['b.txt']);
});

// Untracked at fragment 01's before record: notes.txt, and scratch/inner.txt in a folder with nothing tracked.
function staged(t, numbers = ['01']) {
  const context = setUp(t, {}, numbers);
  context.repo.write('notes.txt', 'notes-one\n');
  context.repo.write('scratch/inner.txt', 'inner-one\n');
  ok(context.patch('record', '01', 'before'));
  ok(context.repo.git('add', 'notes.txt', 'scratch/inner.txt'));
  context.repo.write('notes.txt', 'notes-two\n');
  context.repo.write('scratch/inner.txt', 'inner-two\n');
  context.repo.write('a.txt', 'a1\n');
  return context;
}

test('prompt-plan index changes: staging a file untracked at before leaves it out of the patch, so revert never deletes it', (t) => {
  const { repo, patch, state, read, patchText } = staged(t, ['01', '02']);
  ok(patch('record', '01', 'after'));
  assert.deepEqual(Object.keys(state('01').files), ['a.txt']);
  assert.doesNotMatch(patchText('01'), /notes|inner/);
  ok(patch('revert', '01'));
  assert.deepEqual([read('a.txt'), read('notes.txt'), read('scratch/inner.txt')], ['a0\n', 'notes-two\n', 'inner-two\n']);
  ok(patch('apply', '01'));
  // Tracked since, a later fragment captures it like any tracked file.
  ok(patch('record', '02', 'before'));
  repo.write('notes.txt', 'notes-three\n');
  ok(patch('record', '02', 'after'));
  assert.deepEqual(Object.keys(state('02').files), ['notes.txt']);
  ok(patch('revert', '02'));
  assert.equal(read('notes.txt'), 'notes-two\n');
});

test('prompt-plan index changes: restore leaves a staged file untracked at before as it is', (t) => {
  const { patch, read } = staged(t);
  ok(patch('record', '01', 'restore'));
  assert.deepEqual([read('a.txt'), read('notes.txt'), read('scratch/inner.txt')], ['a0\n', 'notes-two\n', 'inner-two\n']);
});

test('prompt-plan index changes: staging a file an earlier fragment adopted keeps it captured', (t) => {
  const { repo, patch, state, read } = setUp(t, {}, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('made.txt', 'one\n');
  ok(patch('record', '01', 'after', '--include', 'made.txt'));
  ok(patch('record', '02', 'before'));
  ok(repo.git('add', 'made.txt'));
  repo.write('made.txt', 'two\n');
  ok(patch('record', '02', 'after'));
  assert.deepEqual(Object.keys(state('02').files), ['made.txt']);
  ok(patch('revert', '02'));
  assert.equal(read('made.txt'), 'one\n');
  assert.equal(existsSync(join(repo.dir, 'made.txt')), true);
});

test('prompt-plan index changes: a file staged under a folder of held files is reported by after, and no patch carries it', (t) => {
  const { repo, patch, state, patchText } = setUp(t, { '.gitignore': '.temp/\ndist/\n' });
  repo.write('dist/old.js', 'old\n');
  ok(patch('record', '01', 'before'));
  repo.write('dist/new.js', 'built\n');
  ok(repo.git('add', '-f', 'dist/new.js'));
  repo.write('a.txt', 'a1\n');
  const after = patch('record', '01', 'after');
  ok(after);
  assert.match(after.stdout, /files staged since its before record that the working tree held untracked then, or created inside a folder it held untracked whole, which no patch carries:\n {2}dist\/new\.js\n/);
  assert.deepEqual(Object.keys(state('01').files), ['a.txt']);
  assert.doesNotMatch(patchText('01'), /built/);
});
