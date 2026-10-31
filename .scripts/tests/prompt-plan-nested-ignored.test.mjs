// A nested repository that .gitmodules marks ignore = all, which git add skips: prompt-plan's snapshots still take the
// commit it has checked out, so record after reports a fragment that moved it, revert refuses it as it refuses any
// nested repository a fragment changed, and the repository's index stays byte for byte as it was.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { makeRepo, patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

function withIgnoredSubmodule(t) {
  const lib = makeRepo(t);
  lib.write('lib.txt', 'one\n');
  ok(lib.git('add', 'lib.txt'));
  ok(lib.git('commit', '-q', '-m', 'one'));
  const repo = startRepo(t);
  ok(repo.git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', lib.dir, 'vendor/lib'));
  ok(repo.git('config', '-f', '.gitmodules', 'submodule.vendor/lib.ignore', 'all'));
  ok(repo.git('add', '.gitmodules'));
  ok(repo.git('commit', '-q', '-m', 'vendor lib'));
  const sub = join(repo.dir, 'vendor', 'lib');
  return { repo, sub };
}

test('prompt-plan nested ignored: a submodule moved to a new commit under ignore = all is recorded and reported', (t) => {
  const { repo, sub } = withIgnoredSubmodule(t);
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  const inSub = (...args) => repo.git('-C', sub, ...args);
  repo.write(join('vendor', 'lib', 'lib.txt'), 'two\n');
  ok(inSub('commit', '-q', '-a', '-m', 'two'));
  const head = inSub('rev-parse', 'HEAD').stdout.trim();
  repo.write('kept.txt', 'after\n');
  const index = readFileSync(join(repo.dir, '.git', 'index'));
  const after = patch('record', '01', 'after');
  ok(after);
  assert.match(after.stdout, /nested repositories, whose contents no patch carries[^\n]*:\n {2}vendor\/lib: 160000 \S+ -> 160000 (\S+)/);
  const files = JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8')).files;
  assert.equal(files['vendor/lib'].after, `160000 ${head}`);
  const revert = patch('revert', '01');
  assert.equal(revert.status, 1, `${revert.stdout}${revert.stderr}`);
  assert.match(revert.stderr, /a patch cannot carry a nested repository's contents; set each by hand:\n {2}01 vendor\/lib/);
  assert.deepEqual(readFileSync(join(repo.dir, '.git', 'index')), index, 'a script rewrote the repository index');
});

test('prompt-plan nested ignored: a submodule left at its commit under ignore = all is no change', (t) => {
  const { repo } = withIgnoredSubmodule(t);
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  const after = patch('record', '01', 'after');
  ok(after);
  assert.doesNotMatch(after.stdout, /nested repositories/);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8')).files), ['kept.txt']);
  ok(patch('revert', '01'));
  ok(patch('apply', '01'));
});
