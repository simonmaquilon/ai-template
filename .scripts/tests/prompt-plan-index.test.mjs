// What prompt-plan's snapshots read from the repository's index and environment: index marks that hide a file's
// changes, a sparse checkout, pathspec variables, and what a killed run left in patch/ change nothing they record; and
// what they write: the repository's index stays byte for byte as it was, persistent snapshots keep their objects in
// patch/objects, and apply and revert store none.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { patchPlan, run, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const files = (plan, number) => Object.keys(JSON.parse(readFileSync(join(plan, 'patch', `${number}.state`), 'utf8')).files).sort();
const [major, minor] = /(\d+)\.(\d+)/.exec(run('git', ['version']).stdout).slice(1).map(Number);
const sparseAdd = major > 2 || (major === 2 && minor >= 34);

test('prompt-plan index: files marked assume-unchanged or skip-worktree are recorded, and the real index keeps its marks', (t) => {
  const repo = startRepo(t, { 'a.txt': 'a\n', 'b.txt': 'b\n', 'c.txt': 'c\n' });
  ok(repo.git('update-index', '--assume-unchanged', 'a.txt'));
  ok(repo.git('update-index', '--skip-worktree', 'b.txt', 'c.txt'));
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('a.txt', 'a2\n');
  repo.write('b.txt', 'b2\n');
  rmSync(join(repo.dir, 'c.txt'));
  ok(patch('record', '01', 'after'));
  // A skip-worktree entry missing from disk is one the checkout left out, not a deletion.
  assert.deepEqual(files(plan, '01'), ['a.txt', 'b.txt']);
  const marks = repo.git('ls-files', '-v').stdout;
  for (const mark of [/^h a\.txt$/m, /^S b\.txt$/m, /^S c\.txt$/m]) assert.match(marks, mark);
});

test('prompt-plan index: in a sparse checkout, new and changed files outside its definition are recorded', { skip: !sparseAdd && 'git before 2.34 has no sparse checks' }, (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'in/i.txt': 'in\n', 'out/o.txt': 'out\n' });
  ok(repo.git('sparse-checkout', 'set', 'in'));
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('out/o.txt', 'changed\n');
  repo.write('out/new.txt', 'new\n');
  ok(patch('record', '01', 'after', '--include', 'out/new.txt'));
  assert.deepEqual(files(plan, '01'), ['out/new.txt', 'out/o.txt']);
});

test('prompt-plan index: pathspec variables in the environment change nothing a snapshot records', (t) => {
  for (const variable of ['GIT_LITERAL_PATHSPECS', 'GIT_GLOB_PATHSPECS', 'GIT_NOGLOB_PATHSPECS', 'GIT_ICASE_PATHSPECS']) {
    for (const folder of [join('plans', 'p'), join('.temp', 'plans', 'p')]) {
      const repo = startRepo(t);
      const { plan, patch } = patchPlan(repo, ['01'], { [variable]: '1' }, folder);
      ok(patch('record', '01', 'before'));
      repo.write('kept.txt', 'after\n');
      ok(patch('record', '01', 'after'));
      assert.deepEqual(files(plan, '01'), ['kept.txt'], `${variable} with the plan in ${folder}`);
    }
  }
});

test('prompt-plan index: with a split index, no snapshot writes a shared index into the repository', (t) => {
  const repo = startRepo(t);
  ok(repo.git('config', 'core.splitIndex', 'true'));
  ok(repo.git('update-index', '--split-index'));
  repo.write('staged.txt', 'staged\n');
  ok(repo.git('add', 'staged.txt'));
  const shared = () => readdirSync(join(repo.dir, '.git')).filter((name) => name.startsWith('sharedindex.')).length;
  const count = shared();
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '01', 'after'));
  assert.equal(shared(), count);
});

test('prompt-plan index: a lock or temporary index a killed run left behind blocks nothing and is cleared', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01']);
  const patchDir = join(plan, 'patch');
  // The pid of a process that already ended, as a killed run's is.
  const ended = spawnSync(process.execPath, ['-e', '']).pid;
  writeFileSync(join(patchDir, '.snapshot-index.lock'), '');
  mkdirSync(join(patchDir, `.snapshot-${ended}-x`));
  writeFileSync(join(patchDir, `.snapshot-${ended}-x`, 'index.lock'), '');
  // Older than the age below which a folder may belong to a live run in another process namespace.
  const old = new Date(Date.now() - 11 * 60 * 1000);
  utimesSync(join(patchDir, `.snapshot-${ended}-x`), old, old);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '01', 'after'));
  assert.deepEqual(files(plan, '01'), ['kept.txt']);
  assert.deepEqual(readdirSync(patchDir).filter((name) => name.startsWith('.snapshot-') && name !== '.snapshot-index.lock'), []);
});

test('prompt-plan index: no record, restore, apply, or revert changes the repository index, byte for byte', (t) => {
  const repo = startRepo(t);
  const { patch } = patchPlan(repo, ['01', '02']);
  const index = () => readFileSync(join(repo.dir, '.git', 'index'));
  const first = index();
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  repo.write('new.txt', 'new\n');
  ok(patch('record', '01', 'after', '--include', 'new.txt'));
  ok(patch('revert', '01'));
  ok(patch('apply', '01'));
  ok(patch('record', '02', 'before'));
  repo.write('kept.txt', 'two\n');
  ok(patch('record', '02', 'restore'));
  assert.deepEqual(index(), first);
});

test('prompt-plan index: persistent snapshots keep their objects in patch/objects, and apply and revert store none', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01']);
  const stored = () => readdirSync(join(plan, 'patch', 'objects'), { recursive: true }).sort();
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after-content\n');
  ok(patch('record', '01', 'after'));
  const blob = repo.git('hash-object', 'kept.txt').stdout.trim();
  assert.ok(existsSync(join(plan, 'patch', 'objects', blob.slice(0, 2), blob.slice(2))), 'the snapshot kept no object in patch/objects');
  assert.notEqual(repo.git('cat-file', '-e', blob).status, 0, 'the snapshot wrote an object into the repository');
  const kept = stored();
  ok(patch('revert', '01'));
  ok(patch('apply', '01'));
  assert.deepEqual(stored(), kept);
});
