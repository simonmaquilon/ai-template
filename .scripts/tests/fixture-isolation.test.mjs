import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, makeRepo, run } from './support.mjs';

function scratch(t) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.temp', 'isolation-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  return dir;
}

test('git started from a folder under .temp never finds the enclosing repository', (t) => {
  const found = run('git', ['rev-parse', '--show-toplevel'], { cwd: scratch(t) });
  assert.notEqual(found.status, 0, `git reached ${found.stdout.trim()}`);
});

test('makeRepo stops when git cannot create the throwaway repository', (t) => {
  const blocker = join(scratch(t), 'file');
  writeFileSync(blocker, '');
  const previous = process.env.GIT_DIR;
  process.env.GIT_DIR = join(blocker, 'git');
  t.after(() => (previous === undefined ? delete process.env.GIT_DIR : (process.env.GIT_DIR = previous)));
  assert.throws(() => makeRepo(t), /git init failed/);
});
