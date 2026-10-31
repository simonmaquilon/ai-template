// How prompt-plan's patch scripts treat what a file's content alone does not describe: symbolic links, once adopted, and
// file modes revert and apply like any change, while a nested repository that git tracks, whose contents no patch
// carries, is recorded with a warning and refused by apply, revert, and restore, and one with no commit stays as the
// index holds it.

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, makeRepo, patchPlan } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const STACK = /^\s+at /m;

function startRepo(t, files) {
  const repo = makeRepo(t);
  for (const [path, text] of Object.entries(files)) repo.write(path, text);
  ok(repo.git('add', '-A'));
  ok(repo.git('commit', '-q', '-m', 'start'));
  return repo;
}

test('prompt-plan patch: symbolic links and mode changes revert and apply', { skip: WINDOWS && 'symbolic links and file modes need a POSIX file system' }, (t) => {
  const repo = startRepo(t, { 'target.txt': 'target\n', 'sub/inner.txt': 'inner\n', 'run.sh': 'echo run\n' });
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  const at = (path) => join(repo.dir, path);
  const mode = () => statSync(at('run.sh')).mode & 0o777;
  ok(patch('record', '01', 'before'));
  symlinkSync('sub', at('to-dir'));
  symlinkSync('target.txt', at('to-file'));
  ok(patch('record', '01', 'after', '--include', 'to-dir', '--include', 'to-file'));
  ok(patch('record', '02', 'before'));
  chmodSync(at('run.sh'), 0o755);
  ok(patch('record', '02', 'after'));
  const state = JSON.parse(readFileSync(join(plan, 'patch', '02.state'), 'utf8'));
  assert.match(state.files['run.sh'].before, /^100644 [0-9a-f]+$/);
  assert.match(state.files['run.sh'].after, /^100755 [0-9a-f]+$/);
  ok(patch('revert', '02'));
  assert.equal(mode(), 0o644);
  assert.match(patch('revert', '02').stdout, /already reverted/);
  ok(patch('revert', 'all'));
  assert.equal(existsSync(at('to-dir')) || existsSync(at('to-file')), false);
  ok(patch('apply', 'all'));
  assert.equal(readlinkSync(at('to-dir')), 'sub');
  assert.equal(readlinkSync(at('to-file')), 'target.txt');
  assert.equal(mode(), 0o755);
});

test('prompt-plan patch: a nested repository is recorded with a warning, and revert refuses it without touching any file', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n' });
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  mkdirSync(join(repo.dir, 'nested'));
  ok(repo.git('-C', 'nested', 'init', '-q'));
  repo.write('nested/file.txt', 'nested\n');
  ok(repo.git('-C', 'nested', 'add', 'file.txt'));
  ok(repo.git('-C', 'nested', 'commit', '-q', '-m', 'nested'));
  ok(repo.git('add', 'nested'));
  repo.write('kept.txt', 'after\n');
  const after = patch('record', '01', 'after');
  ok(after);
  assert.match(`${after.stdout}${after.stderr}`, /nested repositor[\s\S]*nested/);
  assert.match(JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8')).files.nested.after, /^160000 [0-9a-f]+$/);
  const revert = patch('revert', '01');
  assert.equal(revert.status, 1, `${revert.stdout}${revert.stderr}`);
  assert.match(revert.stderr, /nested repositor[\s\S]*nested/);
  assert.doesNotMatch(revert.stderr, STACK);
  assert.equal(readFileSync(join(repo.dir, 'kept.txt'), 'utf8'), 'after\n');
  // Put back by hand, as the refusal asks, the tree is where fragment 01 started, and apply refuses the same way.
  rmSync(join(repo.dir, 'nested'), { recursive: true, force: true });
  repo.write('kept.txt', 'before\n');
  const apply = patch('apply', '01');
  assert.equal(apply.status, 1, `${apply.stdout}${apply.stderr}`);
  assert.match(apply.stderr, /nested repositor[\s\S]*nested/);
  assert.doesNotMatch(apply.stderr, STACK);
  assert.equal(readFileSync(join(repo.dir, 'kept.txt'), 'utf8'), 'before\n');
});

test('prompt-plan patch: restore refuses a nested repository created after the before record', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n' });
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  mkdirSync(join(repo.dir, 'nested'));
  ok(repo.git('-C', 'nested', 'init', '-q'));
  repo.write('nested/file.txt', 'nested\n');
  ok(repo.git('-C', 'nested', 'add', 'file.txt'));
  ok(repo.git('-C', 'nested', 'commit', '-q', '-m', 'nested'));
  ok(repo.git('add', 'nested'));
  repo.write('kept.txt', 'changed\n');
  const restore = patch('record', '01', 'restore');
  assert.equal(restore.status, 1, `${restore.stdout}${restore.stderr}`);
  assert.match(restore.stderr, /nested repositor[\s\S]*nested/);
  assert.doesNotMatch(restore.stderr, STACK);
  assert.equal(readFileSync(join(repo.dir, 'kept.txt'), 'utf8'), 'changed\n');
});

test('prompt-plan patch: a tracked nested repository with no commit stays as the index holds it', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n' });
  // A gitlink git tracks, whose folder holds a repository that has no commit to point to.
  ok(repo.git('update-index', '--add', '--cacheinfo', `160000,${'1'.repeat(40)},empty`));
  ok(repo.git('commit', '-q', '-m', 'gitlink'));
  mkdirSync(join(repo.dir, 'empty'));
  ok(repo.git('-C', 'empty', 'init', '-q'));
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '01', 'after'));
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8')).files), ['kept.txt']);
  assert.deepEqual(readdirSync(join(plan, 'patch')).filter((name) => name.startsWith('.snapshot-')), [], 'the temporary index stayed behind');
});
