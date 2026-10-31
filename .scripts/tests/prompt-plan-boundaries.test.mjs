// The edges of what prompt-plan's records reach: a nested repository's own uncommitted work is reported and its index
// left as it is, --include paths are resolved to their real folders before the plan and .git are refused, usage errors
// carry no stack trace, and a file whose name is not UTF-8 stops no record, apply, or revert.

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, patchPlan, run, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const refused = (result, pattern) => {
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, pattern);
  assert.doesNotMatch(result.stderr, /^\s+at /m, 'the refusal carries a stack trace');
};

test('prompt-plan boundaries: record after reports a nested repository with uncommitted work', (t) => {
  const repo = startRepo(t);
  mkdirSync(join(repo.dir, 'nested'));
  ok(repo.git('-C', 'nested', 'init', '-q'));
  repo.write('nested/f.txt', 'f\n');
  ok(repo.git('-C', 'nested', 'add', 'f.txt'));
  ok(repo.git('-C', 'nested', 'commit', '-q', '-m', 'nested'));
  ok(repo.git('add', 'nested'));
  ok(repo.git('commit', '-q', '-m', 'with nested'));
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('nested/f.txt', 'changed\n');
  repo.write('nested/g.txt', 'new\n');
  const after = patch('record', '01', 'after');
  ok(after);
  assert.match(after.stdout, /uncommitted[\s\S]*nested/);
});

test('prompt-plan boundaries: --include resolves real folders before refusing the plan and .git', { skip: WINDOWS && 'symbolic links need a POSIX file system' }, (t) => {
  const repo = startRepo(t);
  const { patch } = patchPlan(repo, ['01']);
  const outside = join(repo.dir, '.temp', 'outside');
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, 'x.txt'), 'x\n');
  symlinkSync(outside, join(repo.dir, 'link'));
  mkdirSync(join(repo.dir, 'nested', '.git'), { recursive: true });
  writeFileSync(join(repo.dir, 'nested', '.git', 'config'), '');
  ok(patch('record', '01', 'before'));
  for (const path of [join('link', 'x.txt'), join('nested', '.git', 'config'), join('.GIT', 'config')]) {
    const result = patch('record', '01', 'after', '--include', path);
    assert.notEqual(result.status, 0, `--include ${path} was accepted`);
    assert.doesNotMatch(result.stderr, /^\s+at /m);
  }
});

test('prompt-plan boundaries: usage errors and a plan without build/ are refused without a stack trace', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01']);
  refused(patch('record', '07', 'before'), /Usage|Available fragments/);
  refused(patch('apply', '09'), /Usage|Available fragments/);
  const bare = join(plan, '..', 'bare');
  mkdirSync(join(bare, 'patch'), { recursive: true });
  for (const name of ['common', 'record']) writeFileSync(join(bare, 'patch', `${name}.mjs`), readFileSync(join(plan, 'patch', `${name}.mjs`)));
  refused(run(process.execPath, [join(bare, 'patch', 'record.mjs'), '01', 'before'], { cwd: repo.dir }), /build/);
});

test('prompt-plan boundaries: an untracked file whose name is not UTF-8 stops no record, and no patch carries it', { skip: process.platform !== 'linux' && 'only Linux file systems keep names that are not UTF-8' }, (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', '.gitignore': '.temp/\n*.secret\n' });
  const odd = (name) => Buffer.concat([Buffer.from(`${repo.dir}/bad-`), Buffer.from([0xff]), Buffer.from(name)]);
  writeFileSync(odd('.secret'), 'TOKEN=x\n');
  writeFileSync(odd('.txt'), 'odd\n');
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '01', 'after'));
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8')).files), ['kept.txt']);
});

test('prompt-plan boundaries: a tracked file whose name is not UTF-8 lets apply and revert compare', { skip: process.platform !== 'linux' && 'only Linux file systems keep names that are not UTF-8' }, (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', '.gitignore': '.temp/\n*.log\n' });
  writeFileSync(Buffer.concat([Buffer.from(`${repo.dir}/odd-`), Buffer.from([0xff]), Buffer.from('.txt')]), 'odd\n');
  ok(repo.git('add', '-A'));
  ok(repo.git('commit', '-q', '-m', 'odd name'));
  repo.write('build.log', 'log\n');
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '01', 'after'));
  ok(patch('revert', '01'));
  ok(patch('apply', '01'));
});

test('prompt-plan boundaries: records, apply, and revert leave a dirty nested repository\'s index as it is', (t) => {
  const repo = startRepo(t);
  mkdirSync(join(repo.dir, 'nested'));
  ok(repo.git('-C', 'nested', 'init', '-q'));
  repo.write('nested/f.txt', 'f\n');
  ok(repo.git('-C', 'nested', 'add', 'f.txt'));
  ok(repo.git('-C', 'nested', 'commit', '-q', '-m', 'nested'));
  ok(repo.git('add', 'nested'));
  ok(repo.git('commit', '-q', '-m', 'with nested'));
  repo.write('nested/f.txt', 'changed\n');
  // An index older than its entries makes every status that may take optional locks rewrite it.
  const index = join(repo.dir, 'nested', '.git', 'index');
  const old = new Date('2020-01-01T00:00:00Z');
  utimesSync(index, old, old);
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '01', 'after'));
  ok(patch('revert', '01'));
  ok(patch('apply', '01'));
  assert.equal(statSync(index).mtimeMs, old.getTime());
});
