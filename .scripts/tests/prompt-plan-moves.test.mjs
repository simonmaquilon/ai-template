// What prompt-plan's patch scripts do with a file a fragment took out of the index, through git rm or git mv: revert
// writes it back and says it stays untracked, since no script writes the index, and apply and revert read it all the
// same, so a revert and an apply follow each other; restore lists it apart from the new files it leaves in place, so
// that git add tracks it again before the retry's record after, and refuses, before writing, a file of the before
// snapshot that stands out of the index; and it lists the files staged that the before record held untracked by name
// apart from those staged inside a folder it held untracked whole, each with the git command that undoes it.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { holds, patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const state = (plan, number) => JSON.parse(readFileSync(join(plan, 'patch', `${number}.state`), 'utf8'));
const UNTRACKED_BACK = /files written back that the index no longer tracks[^\n]*:\n {2}old\.js\n/;
const WRITTEN_BACK = (path) => new RegExp(`files written back that the index no longer tracks, as after git rm or git mv during the fragment[^\\n]*git add -- <file>[^\\n]*:\\n {2}${path}\\n`);
const OUT_OF_INDEX = (path) => new RegExp(`the index no longer tracks these files of its before snapshot, which stay on disk[^\\n]*:\\n {2}${path}`);
const CREATED = (path) => new RegExp(`files created since its before record[^\\n]*:\\n {2}${path}\\n`);

test('prompt-plan moves: a fragment that ran git mv reverts and applies again, and the index stays as the fragment left it', (t) => {
  const repo = startRepo(t, { 'old.js': 'code\n', 'a.txt': 'one\n' });
  const { patch } = patchPlan(repo, ['01', '02']);
  const read = (path) => (existsSync(join(repo.dir, path)) ? readFileSync(join(repo.dir, path), 'utf8') : null);
  ok(patch('record', '01', 'before'));
  ok(repo.git('mv', 'old.js', 'new.js'));
  repo.write('a.txt', 'two\n');
  ok(patch('record', '01', 'after'));
  ok(patch('record', '02', 'before'));
  repo.write('a.txt', 'three\n');
  ok(patch('record', '02', 'after'));
  const staged = repo.git('diff', '--cached', '--name-status').stdout;
  const revert = patch('revert', 'all');
  ok(revert);
  assert.match(revert.stdout, UNTRACKED_BACK);
  assert.deepEqual(['old.js', 'new.js', 'a.txt'].map(read), ['code\n', null, 'one\n']);
  ok(patch('apply', 'all'));
  assert.deepEqual(['old.js', 'new.js', 'a.txt'].map(read), [null, 'code\n', 'three\n']);
  ok(patch('revert', '02'));
  ok(patch('revert', '01'));
  ok(patch('apply', '01'));
  assert.deepEqual(['old.js', 'new.js', 'a.txt'].map(read), [null, 'code\n', 'two\n']);
  assert.equal(repo.git('diff', '--cached', '--name-status').stdout, staged, 'a script changed the index');
});

test('prompt-plan moves: a fragment that ran git rm reverts, applies, and reverts again', (t) => {
  const repo = startRepo(t, { 'legacy.js': 'old\n', 'kept.txt': 'before\n' });
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  ok(repo.git('rm', '-q', 'legacy.js'));
  ok(patch('record', '01', 'after'));
  assert.equal(state(plan, '01').files['legacy.js'].after, null);
  for (const [script, held] of [['revert', true], ['apply', false], ['revert', true]]) {
    ok(patch(script, '01'));
    assert.equal(existsSync(join(repo.dir, 'legacy.js')), held, script);
  }
});

test('prompt-plan moves: restore lists a file it writes back after git rm apart from new ones, and the retry records once git add tracks it again', (t) => {
  const repo = startRepo(t, { 'old.js': 'code\n', 'kept.txt': 'before\n' });
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  ok(repo.git('rm', '-q', 'old.js'));
  repo.write('kept.txt', 'failed\n');
  repo.write('made.txt', 'made\n');
  const restore = patch('record', '01', 'restore');
  ok(restore);
  assert.equal(readFileSync(join(repo.dir, 'old.js'), 'utf8'), 'code\n');
  assert.match(restore.stdout, WRITTEN_BACK('old\\.js'));
  assert.match(restore.stdout, CREATED('made\\.txt'));
  // The retry keeps old.js, which the index tracks again, and the patch carries only what it changes.
  repo.write('kept.txt', 'after\n');
  const refused = patch('record', '01', 'after', '--leave', 'made.txt');
  assert.equal(refused.status, 1, `${refused.stdout}${refused.stderr}`);
  assert.match(refused.stderr, OUT_OF_INDEX('old\\.js'));
  ok(repo.git('add', 'old.js'));
  ok(patch('record', '01', 'after', '--leave', 'made.txt'));
  assert.deepEqual(Object.keys(state(plan, '01').files), ['kept.txt']);
  ok(patch('revert', '01'));
  ok(patch('apply', '01'));
  assert.equal(readFileSync(join(repo.dir, 'old.js'), 'utf8'), 'code\n');
});

test('prompt-plan moves: restore refuses, unread, a file git mv left out of the index that the fragment rewrote, until git add', (t) => {
  const repo = startRepo(t, { 'config.js': 'config\n', 'kept.txt': 'before\n' });
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  ok(repo.git('mv', 'config.js', 'lib.js'));
  repo.write('config.js', 'shim\n');
  repo.write('kept.txt', 'failed\n');
  const refused = patch('record', '01', 'restore');
  assert.equal(refused.status, 1, `${refused.stdout}${refused.stderr}`);
  assert.match(refused.stderr, OUT_OF_INDEX('config\\.js'));
  assert.deepEqual(['config.js', 'kept.txt'].map((path) => readFileSync(join(repo.dir, path), 'utf8')), ['shim\n', 'failed\n']);
  assert.equal(holds(repo, plan, 'shim\n'), false, 'restore stored the file it refused');
  ok(repo.git('add', 'config.js'));
  const restore = patch('record', '01', 'restore');
  ok(restore);
  assert.deepEqual(['config.js', 'kept.txt'].map((path) => readFileSync(join(repo.dir, path), 'utf8')), ['config\n', 'before\n']);
  assert.match(restore.stdout, CREATED('lib\\.js'));
});

test('prompt-plan moves: restore lists staged files held untracked by name apart from those inside a folder held whole', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', '.gitignore': '.temp/\ndist/\n' });
  repo.write('dist/old.js', 'built\n');
  repo.write('notes.txt', 'mine\n');
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'failed\n');
  repo.write('dist/new.js', 'new\n');
  ok(repo.git('add', '-f', 'dist/new.js', 'notes.txt'));
  const restore = patch('record', '01', 'restore');
  ok(restore);
  assert.equal(readFileSync(join(repo.dir, 'kept.txt'), 'utf8'), 'before\n');
  assert.match(restore.stdout, /files staged since its before record inside a folder it held untracked whole[^\n]*unstage with git rm --cached -- <file> those it staged:\n {2}dist\/new\.js\n/);
  assert.match(restore.stdout, /files staged since its before record that the working tree held untracked by that name then[^\n]*put back by hand any the fragment changed:\n {2}notes\.txt\n/);
  assert.deepEqual(['dist/new.js', 'notes.txt'].map((path) => readFileSync(join(repo.dir, path), 'utf8')), ['new\n', 'mine\n']);
});
