import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { makeRepo, run } from './support.mjs';

function runWithLockedDirectory(repo, locked, occupied = false) {
  repo.write('.temp/locked-directory.mjs', `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const remove = fs.rmdirSync;
fs.rmdirSync = (path) => {
  if (path === ${JSON.stringify(locked)}) {
    if (${occupied}) console.error("Attempted removal of an occupied directory");
    const error = new Error('Directory is held open by another process');
    error.code = 'EBUSY';
    throw error;
  }
  return remove(path);
};
syncBuiltinESMExports();
await import('../.scripts/check-empty-dirs.mjs');
`);
  return run(process.execPath, ['.temp/locked-directory.mjs'], { cwd: repo.dir });
}

test('empty-directory cleanup preserves occupied directories when Windows reports them busy', (t) => {
  const repo = makeRepo(t);
  repo.write('occupied/keep.txt', 'kept\n');
  mkdirSync(join(repo.dir, 'unused'));
  const result = runWithLockedDirectory(repo, 'occupied', true);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(existsSync(join(repo.dir, 'occupied', 'keep.txt')), true);
  assert.equal(existsSync(join(repo.dir, 'unused')), false);
});

test('empty-directory cleanup leaves a locked empty directory and still removes other empty directories', (t) => {
  const repo = makeRepo(t);
  mkdirSync(join(repo.dir, 'locked'));
  mkdirSync(join(repo.dir, 'unused'));
  const result = runWithLockedDirectory(repo, 'locked');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(repo.dir, 'locked')), true);
  assert.equal(existsSync(join(repo.dir, 'unused')), false);
  assert.doesNotMatch(result.stdout, /\.\/locked/);
});
