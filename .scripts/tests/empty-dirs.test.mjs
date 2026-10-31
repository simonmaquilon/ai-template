import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, makeRepo, run } from './support.mjs';

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

// A repository that reads only its own ignore rules, so the user's global ones, which often hide .cc-writes, do not apply.
function makeOwnRulesRepo(t, rules = '') {
  const repo = makeRepo(t);
  repo.git('config', 'core.excludesFile', join(repo.dir, '.git', 'no-global-rules'));
  repo.write('.git/info/exclude', rules);
  return repo;
}

test('empty-directory cleanup keeps the root .claude/.cc-writes when no ignore rule hides it', (t) => {
  const repo = makeOwnRulesRepo(t);
  for (const path of ['.claude/.cc-writes', 'sub/.claude/.cc-writes', 'onlycc/.claude/.cc-writes']) mkdirSync(join(repo.dir, path), { recursive: true });
  repo.write('sub/keep.txt', 'kept\n');
  const result = repo.script('check-empty-dirs.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(repo.dir, '.claude', '.cc-writes')), true);
  assert.equal(existsSync(join(repo.dir, 'sub', '.claude')), false);
  assert.equal(existsSync(join(repo.dir, 'onlycc')), false);
});

test('empty-directory cleanup removes the .cc-writes ignore rules hide without entering the directories they match', (t) => {
  const repo = makeOwnRulesRepo(t, '**/.claude/.cc-writes/\n/ruled/.claude/\n/link/.claude/\n/locked/.claude/\nnode_modules/\n');
  for (const path of ['.claude/.cc-writes', 'onlycc/.claude/.cc-writes', 'ruled/.claude/.cc-writes', 'build/node_modules/empty']) {
    mkdirSync(join(repo.dir, path), { recursive: true });
  }
  repo.write('ruled/keep.txt', 'kept\n');
  if (!WINDOWS) {
    mkdirSync(join(repo.dir, '.temp', 'target'), { recursive: true });
    mkdirSync(join(repo.dir, 'link', '.claude'), { recursive: true });
    symlinkSync(join(repo.dir, '.temp', 'target'), join(repo.dir, 'link', '.claude', '.cc-writes'));
    mkdirSync(join(repo.dir, 'locked', '.claude', '.cc-writes'), { recursive: true });
    chmodSync(join(repo.dir, 'locked', '.claude'), 0o000);
  }
  let result;
  try {
    result = repo.script('check-empty-dirs.mjs');
  } finally {
    if (!WINDOWS) chmodSync(join(repo.dir, 'locked', '.claude'), 0o755);
  }
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /\.\/onlycc\/\.claude\/\.cc-writes/);
  for (const path of ['onlycc', 'ruled/.claude']) assert.equal(existsSync(join(repo.dir, path)), false, path);
  for (const path of ['.claude/.cc-writes', 'ruled/keep.txt', 'build/node_modules/empty']) assert.equal(existsSync(join(repo.dir, path)), true, path);
  if (!WINDOWS) assert.equal(existsSync(join(repo.dir, '.temp', 'target')), true);
});
