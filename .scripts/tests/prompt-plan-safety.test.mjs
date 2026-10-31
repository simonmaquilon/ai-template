// What keeps prompt-plan's patch scripts from writing half a change or past their limits: a folder where a patch
// needs a file is refused before anything is written, a second before record is refused, a staged plan file blocks
// nothing, and a gitlink with no repository behind it is no warning.

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const refused = (result, pattern) => {
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, pattern);
  assert.doesNotMatch(result.stderr, /^\s+at /m, 'the refusal carries a stack trace');
};

test('prompt-plan safety: a folder where a patch needs a file is refused before apply, revert, or restore writes anything', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', build: 'file\n' });
  const { patch } = patchPlan(repo, ['01', '02']);
  const read = (path) => readFileSync(join(repo.dir, path), 'utf8');
  ok(patch('record', '01', 'before'));
  rmSync(join(repo.dir, 'build'));
  repo.write('build/out.txt', 'out\n');
  repo.write('.gitignore', '.temp/\nbuild/\n');
  ok(patch('record', '01', 'after'));
  refused(patch('revert', '01'), /build/);
  assert.equal(read('.gitignore'), '.temp/\nbuild/\n');
});

test('prompt-plan safety: restore refuses a folder where it must put a file back, writing nothing', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', build: 'file\n' });
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'changed\n');
  rmSync(join(repo.dir, 'build'));
  repo.write('build/out.txt', 'out\n');
  repo.write('.gitignore', '.temp/\nbuild/\n');
  refused(patch('record', '01', 'restore'), /build/);
  assert.equal(readFileSync(join(repo.dir, 'kept.txt'), 'utf8'), 'changed\n');
});

test('prompt-plan safety: a second before record is refused, so a retry keeps the first', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  const first = readFileSync(join(plan, 'patch', '01.before'), 'utf8');
  repo.write('kept.txt', 'changed\n');
  refused(patch('record', '01', 'before'), /already|restore/);
  assert.equal(readFileSync(join(plan, 'patch', '01.before'), 'utf8'), first);
});

test('prompt-plan safety: a plan file staged and changed since blocks no snapshot', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01'], {}, join('plans', 'p'));
  ok(repo.git('add', join('plans', 'p', 'build', '01-step.md')));
  repo.write(join('plans', 'p', 'build', '01-step.md'), '# 01, edited\n');
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '01', 'after'));
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8')).files), ['kept.txt']);
});

test('prompt-plan safety: a gitlink with no repository behind it is no warning, and the index stays untouched', (t) => {
  const repo = startRepo(t);
  // An uninitialized submodule: a gitlink in the index and an empty folder on disk.
  ok(repo.git('update-index', '--add', '--cacheinfo', `160000,${'1'.repeat(40)},sub`));
  ok(repo.git('commit', '-q', '-m', 'gitlink'));
  mkdirSync(join(repo.dir, 'sub'));
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  const index = join(repo.dir, '.git', 'index');
  const before = statSync(index).mtimeMs;
  const after = patch('record', '01', 'after');
  ok(after);
  assert.doesNotMatch(after.stdout, /uncommitted/);
  assert.equal(statSync(index).mtimeMs, before, 'record rewrote the repository index');
});
