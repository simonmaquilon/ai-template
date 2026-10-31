// On a file system that does not tell names apart by case, a file the index tracks under another spelling than a path
// a fragment recorded is that file, not one that nothing tracks: apply and revert refuse it instead of reading the
// recorded path as an untracked copy, and leave it as it is.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

function ignoresCase(dir) {
  writeFileSync(join(dir, 'Probe'), '');
  const found = existsSync(join(dir, 'probe'));
  rmSync(join(dir, 'Probe'));
  return found;
}

test('prompt-plan case untracked: a file tracked in another spelling than a deleted one is no copy of it', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'Dir/file.txt': 'same\n' });
  if (!ignoresCase(repo.dir)) {
    t.skip('this file system tells names apart by case');
    return;
  }
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  ok(repo.git('rm', '-q', 'Dir/file.txt'));
  ok(patch('record', '01', 'after'));
  ok(repo.git('commit', '-q', '-m', 'drop'));
  repo.write('dir/file.txt', 'same\n');
  ok(repo.git('add', 'dir/file.txt'));
  ok(repo.git('commit', '-q', '-m', 'user file'));
  for (const script of ['apply', 'revert']) {
    const result = patch(script, '01');
    assert.equal(result.status, 1, `${script}: ${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /match no recorded fragment state:\n {2}Dir\/file\.txt/);
    assert.equal(readFileSync(join(repo.dir, 'dir', 'file.txt'), 'utf8'), 'same\n');
  }
});
