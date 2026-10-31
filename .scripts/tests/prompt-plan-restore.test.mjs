// prompt-plan's record restore, fragments that change no file, and a listing record after cannot make: what the
// patch scripts do around a fragment besides recording its change. Restore leaves a file created and staged during the
// fragment where it is, as it leaves an untracked one, and lists it.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const state = (plan, number) => JSON.parse(readFileSync(join(plan, 'patch', `${number}.state`), 'utf8'));

test('prompt-plan restore: puts back changed binary and deleted files, leaves new ones, and says so when run again', (t) => {
  const repo = startRepo(t, { 'data.bin': '\0\x01', 'gone.txt': 'gone\n' });
  const { plan, patch } = patchPlan(repo, ['01']);
  const at = (path) => join(repo.dir, path);
  ok(patch('record', '01', 'before'));
  writeFileSync(at('data.bin'), Buffer.from([0, 9, 9]));
  rmSync(at('gone.txt'));
  repo.write('new.txt', 'new\n');
  writeFileSync(at('new.bin'), Buffer.from([0, 1, 2]));
  ok(patch('record', '01', 'restore'));
  assert.deepEqual(readFileSync(at('data.bin')), Buffer.from([0, 1]));
  assert.equal(readFileSync(at('gone.txt'), 'utf8'), 'gone\n');
  assert.equal(existsSync(at('new.txt')) && existsSync(at('new.bin')), true, 'restore deleted an untracked file');
  assert.match(patch('record', '01', 'restore').stdout, /already matches/);
  assert.ok(existsSync(join(plan, 'patch', '01.before')));
  assert.deepEqual(readdirSync(join(plan, 'patch')).filter((name) => name.endsWith('.restore')), []);
});

test('prompt-plan restore: a file created and staged during the fragment stays, and is listed with the untracked ones', (t) => {
  const repo = startRepo(t);
  const { patch } = patchPlan(repo, ['01']);
  const read = (path) => readFileSync(join(repo.dir, path), 'utf8');
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'changed\n');
  repo.write('staged.txt', 'staged\n');
  repo.write('plain.txt', 'plain\n');
  ok(repo.git('add', 'staged.txt'));
  const restore = patch('record', '01', 'restore');
  ok(restore);
  assert.deepEqual(['kept.txt', 'staged.txt', 'plain.txt'].map(read), ['before\n', 'staged\n', 'plain\n']);
  assert.match(restore.stdout, /left in place[^\n]*:\n {2}plain\.txt\n {2}staged\.txt\n/);
  ok(patch('record', '01', 'restore'));
});

test('prompt-plan restore: a fragment that changes no file is passed over by apply and revert', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  const kept = () => readFileSync(join(repo.dir, 'kept.txt'), 'utf8');
  ok(patch('record', '01', 'before'));
  ok(patch('record', '01', 'after'));
  assert.equal(readFileSync(join(plan, 'patch', '01.patch')).length, 0);
  assert.deepEqual(state(plan, '01').files, {});
  ok(patch('record', '02', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '02', 'after'));
  for (const script of ['apply', 'revert']) assert.match(patch(script, '01').stdout, /changes no file; skipped/);
  ok(patch('revert', 'all'));
  assert.equal(kept(), 'before\n');
  ok(patch('apply', '02'));
  assert.equal(kept(), 'after\n');
});

test('prompt-plan restore: record after keeps its record and reports, without a stack trace, a listing it cannot make', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'one\n');
  ok(patch('record', '01', 'after'));
  writeFileSync(join(plan, 'patch', '01.state'), JSON.stringify({ ...state(plan, '01'), afterTree: 'f'.repeat(40) }));
  ok(patch('record', '02', 'before'));
  repo.write('kept.txt', 'two\n');
  const after = patch('record', '02', 'after');
  assert.equal(after.status, 1, `${after.stdout}${after.stderr}`);
  assert.match(after.stderr, /could not be listed/);
  assert.doesNotMatch(after.stderr, /^\s+at /m);
  assert.deepEqual(Object.keys(state(plan, '02').files), ['kept.txt']);
});
