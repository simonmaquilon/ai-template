// What prompt-plan's patch scripts refuse with a clear message and no stack trace: a record taken in another
// repository or worktree than the one it started in, also by apply and revert and also for a fragment that changes no
// file, an --include of the plan, of .git, or through a file, build files that share a fragment number, a snapshot whose
// own tree git gc pruned, a file where a patch needs a folder, a patch that no longer applies, and a tracked file git
// cannot read; and a root file named like ..notes is no outside path.

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, patchPlan, run, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const refused = (result, pattern) => {
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, pattern);
  assert.doesNotMatch(result.stderr, /^\s+at /m, 'the refusal carries a stack trace');
};

test('prompt-plan misuse: a record started in one worktree is refused in another, by record, apply, and revert', (t) => {
  const repo = startRepo(t);
  const other = join(repo.dir, '.temp', 'other');
  ok(repo.git('worktree', 'add', '-q', other));
  // A plan outside any repository runs on the repository of the folder it runs from.
  const planDir = mkdtempSync(join(ROOT, '.temp', 'hook-test-plan-'));
  t.after(() => rmSync(planDir, { recursive: true, force: true, maxRetries: 5 }));
  const { plan } = patchPlan({ dir: planDir }, ['01', '02'], {}, '.');
  const from = (cwd, script, ...args) => run(process.execPath, [join(plan, 'patch', `${script}.mjs`), '01', ...args], { cwd });
  ok(from(repo.dir, 'record', 'before'));
  refused(from(other, 'record', 'after'), /another repository|worktree/);
  repo.write('kept.txt', 'after\n');
  ok(from(repo.dir, 'record', 'after'));
  for (const script of ['apply', 'revert']) refused(from(other, script), /another repository|worktree/);
  refused(run(process.execPath, [join(plan, 'patch', 'record.mjs'), '02', 'before'], { cwd: other }), /another repository|worktree/);
  // A fragment that changes no file names its repository too, so apply and revert refuse it elsewhere and skip it here.
  const second = (cwd, script, ...args) => run(process.execPath, [join(plan, 'patch', `${script}.mjs`), '02', ...args], { cwd });
  ok(second(repo.dir, 'record', 'before'));
  ok(second(repo.dir, 'record', 'after'));
  for (const script of ['apply', 'revert']) {
    refused(second(other, script), /another repository|worktree/);
    assert.match(second(repo.dir, script).stdout, /changes no file; skipped/);
  }
  assert.equal(readFileSync(join(repo.dir, 'kept.txt'), 'utf8'), 'after\n');
});

test('prompt-plan misuse: apply all and revert all refuse in another repository when every fragment changes no file', (t) => {
  const [repo, other] = [startRepo(t), startRepo(t)];
  const planDir = mkdtempSync(join(ROOT, '.temp', 'hook-test-plan-'));
  t.after(() => rmSync(planDir, { recursive: true, force: true, maxRetries: 5 }));
  const { plan } = patchPlan({ dir: planDir }, ['01', '02'], {}, '.');
  const from = (cwd, script, ...args) => run(process.execPath, [join(plan, 'patch', `${script}.mjs`), ...args], { cwd });
  for (const number of ['01', '02']) for (const phase of ['before', 'after']) ok(from(repo.dir, 'record', number, phase));
  for (const script of ['apply', 'revert']) {
    refused(from(other.dir, script, 'all'), /another repository|worktree/);
    ok(from(repo.dir, script, 'all'));
  }
});

test('prompt-plan misuse: --include refuses the files of the plan and of .git', (t) => {
  const repo = startRepo(t);
  const { patch } = patchPlan(repo, ['01'], {}, join('plans', 'p'));
  ok(patch('record', '01', 'before'));
  for (const path of [join('plans', 'p', 'build', '01-step.md'), join('.git', 'config')]) {
    refused(patch('record', '01', 'after', '--include', path), /names no file inside the repository, outside the plan and outside \.git\./);
  }
});

test('prompt-plan misuse: --include through a file, and build files that share a number, are refused', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  refused(patch('record', '01', 'after', '--include', 'kept.txt/inner'), /names no file inside the repository, outside the plan and outside \.git\./);
  writeFileSync(join(plan, 'build', '01-other.md'), '# 01\n');
  refused(patch('apply', 'all'), /share a fragment number[\s\S]*01-other\.md/);
});

test('prompt-plan misuse: --include takes a root file named like ..notes', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01']);
  repo.write('.temp/..notes', 'notes\n');
  ok(patch('record', '01', 'before'));
  renameSync(join(repo.dir, '.temp', '..notes'), join(repo.dir, '..notes'));
  ok(patch('record', '01', 'after', '--include', '..notes'));
  assert.deepEqual(JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8')).included, ['..notes']);
});

test('prompt-plan misuse: a before snapshot whose own tree git gc pruned is refused with that reason', (t) => {
  const repo = startRepo(t);
  const { patch } = patchPlan(repo, ['01']);
  // A clean tree: the before snapshot is the commit's tree, which only the repository holds.
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'amended\n');
  ok(repo.git('commit', '-q', '-a', '--amend', '-m', 'amended'));
  ok(repo.git('reflog', 'expire', '--expire=now', '--all'));
  ok(repo.git('gc', '--prune=now', '-q'));
  refused(patch('record', '01', 'restore'), /pruned/);
});

test('prompt-plan misuse: a file where a patch needs a folder is refused before anything is written', (t) => {
  const repo = startRepo(t);
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('d/x.txt', 'x\n');
  ok(patch('record', '01', 'after', '--include', 'd/x.txt'));
  ok(patch('revert', '01'));
  repo.write('d', 'file\n');
  refused(patch('apply', '01'), /stands where[\s\S]*d\/x\.txt/);
});

test('prompt-plan misuse: a tracked file git cannot read stops a snapshot with the reason git gives', { skip: (process.platform === 'win32' || process.getuid?.() === 0) && 'needs a file its owner cannot read' }, (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'locked.txt': 'locked\n' });
  const { plan, patch } = patchPlan(repo, ['01']);
  chmodSync(join(repo.dir, 'locked.txt'), 0o000);
  const result = patch('record', '01', 'before');
  chmodSync(join(repo.dir, 'locked.txt'), 0o644);
  refused(result, /locked\.txt/);
  assert.equal(existsSync(join(plan, 'patch', '01.before')), false);
});

test('prompt-plan misuse: a patch git cannot write is refused with the reason git gives', { skip: (process.platform === 'win32' || process.getuid?.() === 0) && 'needs a folder its owner cannot write' }, (t) => {
  const repo = startRepo(t);
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('ro/x.txt', 'x\n');
  ok(patch('record', '01', 'after', '--include', 'ro/x.txt'));
  ok(patch('revert', '01'));
  mkdirSync(join(repo.dir, 'ro'), { recursive: true });
  chmodSync(join(repo.dir, 'ro'), 0o555);
  const result = patch('apply', '01');
  chmodSync(join(repo.dir, 'ro'), 0o755);
  refused(result, /may now hold part of that fragment's patch[^\n]*\n[\s\S]*ro\/x\.txt/);
});
