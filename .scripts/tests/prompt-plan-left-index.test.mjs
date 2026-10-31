// Taking a file out of the index while it stays on disk, which no patch can carry, stays outside the plan: a fragment
// that does so, through a commit that stops tracking its output or git reset between fragments, cannot record, and
// the next one cannot start, until git add tracks the file again, with -f where it is ignored; nothing it read is
// stored, and once it is tracked again the plan reverts and applies as before. A file a fragment removed with git rm that
// a build or install writes again is deleted again before the record, and later it counts as absent where its bytes
// fit no point of the sequence, so fragments start and revert refuses with git's reason to write over it, and for what
// it holds where they do, as the same bytes rebuilt read as the fragment reverted, which apply then deletes again.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { holds, patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const refused = (result, pattern) => {
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, pattern);
  assert.doesNotMatch(result.stderr, /^\s+at /m, 'the refusal carries a stack trace');
};
const state = (plan, number) => JSON.parse(readFileSync(join(plan, 'patch', `${number}.state`), 'utf8'));
const OUT_OF_INDEX = (what, path) => new RegExp(`the index no longer tracks these files of ${what}, which stay on disk, and no patch can carry taking a file out of the index; track each again with git add -- <file>, with -f for an ignored one, and leave taking it out of the index until after closing[^\\n]*:\\n {2}${path}`);

test('prompt-plan left index: a commit that stops tracking output a fragment rebuilt is refused until git add -f tracks it again', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'a.txt': 'one\n', 'dist/bundle.js': 'v0\n' });
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('dist/bundle.js', 'v1\n');
  repo.write('a.txt', 'two\n');
  ok(patch('record', '01', 'after'));
  ok(patch('record', '02', 'before'));
  ok(repo.git('rm', '-r', '-q', '--cached', 'dist'));
  repo.write('.gitignore', '.temp/\ndist/\n');
  ok(repo.git('commit', '-q', '-a', '-m', 'stop tracking dist'));
  repo.write('dist/bundle.js', 'secret build\n');
  refused(patch('record', '02', 'after'), OUT_OF_INDEX('its before snapshot', 'dist/bundle\\.js'));
  assert.equal(existsSync(join(plan, 'patch', '02.state')), false);
  assert.equal(holds(repo, plan, 'secret build\n'), false, 'the refused run stored the file');
  // Tracked again, the rebuilt output is a change of the fragment's, and the plan reverts and applies.
  ok(repo.git('add', '-f', 'dist/bundle.js'));
  ok(patch('record', '02', 'after'));
  assert.deepEqual(Object.keys(state(plan, '02').files).sort(), ['.gitignore', 'dist/bundle.js']);
  ok(patch('revert', 'all'));
  assert.equal(readFileSync(join(repo.dir, 'dist', 'bundle.js'), 'utf8'), 'v0\n');
  ok(patch('apply', 'all'));
  assert.equal(readFileSync(join(repo.dir, 'dist', 'bundle.js'), 'utf8'), 'secret build\n');
});

test('prompt-plan left index: after git reset between fragments, the next one starts once git add tracks the file again', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('new.js', 'one\n');
  ok(repo.git('add', 'new.js'));
  ok(patch('record', '01', 'after'));
  ok(repo.git('reset', '-q'));
  refused(patch('record', '02', 'before'), OUT_OF_INDEX("fragment 01's after record", 'new\\.js'));
  assert.equal(existsSync(join(plan, 'patch', '02.before')), false);
  ok(repo.git('add', 'new.js'));
  ok(patch('record', '02', 'before'));
  repo.write('new.js', 'two\n');
  ok(patch('record', '02', 'after'));
  assert.deepEqual(Object.keys(state(plan, '02').files), ['new.js']);
  ok(patch('revert', 'all'));
  assert.equal(existsSync(join(repo.dir, 'new.js')), false);
  ok(patch('apply', 'all'));
  assert.equal(readFileSync(join(repo.dir, 'new.js'), 'utf8'), 'two\n');
});

test('prompt-plan left index: output a fragment removed with git rm and rebuilt is deleted again before the record, and later counts as absent', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'dist/app.js': 'v0\n' });
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  ok(repo.git('rm', '-q', 'dist/app.js'));
  repo.write('.gitignore', '.temp/\ndist/\n');
  repo.write('dist/app.js', 'v1\n');
  refused(patch('record', '01', 'after'), /delete instead each one the fragment removed with git rm, from the index and the disk, that a build or install wrote again[^\n]*:\n {2}dist\/app\.js/);
  rmSync(join(repo.dir, 'dist', 'app.js'));
  ok(patch('record', '01', 'after'));
  assert.equal(state(plan, '01').files['dist/app.js'].after, null);
  repo.write('dist/app.js', 'v2\n');
  ok(patch('record', '02', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '02', 'after'));
  refused(patch('revert', 'all'), /Fragment 01: its patch does not revert from the working tree[\s\S]*dist\/app\.js: already exists/);
  assert.equal(readFileSync(join(repo.dir, 'dist', 'app.js'), 'utf8'), 'v2\n');
  rmSync(join(repo.dir, 'dist', 'app.js'));
  ok(patch('revert', 'all'));
  assert.equal(readFileSync(join(repo.dir, 'dist', 'app.js'), 'utf8'), 'v0\n');
  ok(patch('apply', 'all'));
  assert.equal(existsSync(join(repo.dir, 'dist', 'app.js')), false);
});

test('prompt-plan left index: a lockfile a fragment removed with git rm and a later install wrote again lets the next fragment start', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'package-lock.json': '{}\n' });
  const { patch } = patchPlan(repo, ['01', '02', '03']);
  ok(patch('record', '01', 'before'));
  ok(repo.git('rm', '-q', 'package-lock.json'));
  ok(patch('record', '01', 'after'));
  ok(patch('record', '02', 'before'));
  repo.write('package-lock.json', '{"v":2}\n');
  repo.write('kept.txt', 'two\n');
  ok(patch('record', '02', 'after', '--leave', 'package-lock.json'));
  ok(patch('record', '03', 'before'));
  assert.equal(readFileSync(join(repo.dir, 'package-lock.json'), 'utf8'), '{"v":2}\n');
});

test('prompt-plan left index: a lockfile rebuilt with the bytes a fragment removed reads as that fragment reverted, which apply deletes again', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'package-lock.json': '{}\n' });
  const { patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  ok(repo.git('rm', '-q', 'package-lock.json'));
  ok(patch('record', '01', 'after'));
  repo.write('package-lock.json', '{}\n');
  refused(patch('record', '02', 'before'), /run apply 01 first/);
  ok(patch('apply', '01'));
  assert.equal(existsSync(join(repo.dir, 'package-lock.json')), false);
  ok(patch('record', '02', 'before'));
});

test('prompt-plan left index: an adopted file staged between fragments and unstaged in the next one stays captured', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('new.md', 'one\n');
  ok(patch('record', '01', 'after', '--include', 'new.md'));
  ok(repo.git('add', '--', 'new.md'));
  ok(patch('record', '02', 'before'));
  ok(repo.git('reset', '-q', '--', 'new.md'));
  repo.write('new.md', 'two\n');
  ok(patch('record', '02', 'after'));
  assert.deepEqual(Object.keys(state(plan, '02').files), ['new.md']);
  ok(patch('revert', '02'));
  assert.equal(readFileSync(join(repo.dir, 'new.md'), 'utf8'), 'one\n');
});
