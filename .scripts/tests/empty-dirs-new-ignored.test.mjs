// The empty-directory cleanup lists the ignored directories once, at start; another hook of the same message can create
// an ignored directory after that, such as .temp/ in a fresh clone, and the cleanup must not take it for a plain one.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { makeRepo, run } from './support.mjs';

// A repository that reads only its own ignore rules (.gitignore ignores .temp/), not the user's global ones.
function makeOwnRulesRepo(t, rules = '') {
  const repo = makeRepo(t);
  repo.git('config', 'core.excludesFile', join(repo.dir, '.git', 'no-global-rules'));
  repo.write('.git/info/exclude', rules);
  return repo;
}

// Runs the cleanup so that `paths` appear, as directories, right before it reads the root, which is after the ignored
// directories were listed. `patch` adds code that runs before the cleanup is imported.
function runCreating(repo, paths, patch = '') {
  repo.write('.git/created-later.mjs', `
import cp from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const read = fs.readdirSync;
let fired = false;
fs.readdirSync = (path, ...rest) => {
  if (!fired && path === '.') {
    fired = true;
    for (const created of ${JSON.stringify(paths)}) fs.mkdirSync(created, { recursive: true });
  }
  return read(path, ...rest);
};
${patch}
syncBuiltinESMExports();
await import('../.scripts/check-empty-dirs.mjs');
`);
  return run(process.execPath, ['.git/created-later.mjs'], { cwd: repo.dir });
}

const exists = (repo, path) => existsSync(join(repo.dir, path));

test('empty-directory cleanup keeps an ignored directory created after the listing and removes a plain one made with it', (t) => {
  const repo = makeOwnRulesRepo(t);
  const result = runCreating(repo, ['.temp/x/y', 'plain/empty']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'Removed empty directories (03-code-authoring.md): ./plain/empty\n./plain\n');
  assert.equal(exists(repo, '.temp/x/y'), true);
  assert.equal(exists(repo, 'plain'), false);
});

test('empty-directory cleanup still removes a .cc-writes that a rule hides and keeps the root one, created after the listing', (t) => {
  const repo = makeOwnRulesRepo(t, '**/.claude/.cc-writes/\n');
  const result = runCreating(repo, ['.temp/x', '.claude/.cc-writes', 'sub/.claude/.cc-writes']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'Removed empty directories (03-code-authoring.md): ./sub/.claude/.cc-writes\n./sub/.claude\n./sub\n');
  assert.equal(exists(repo, '.temp/x'), true);
  assert.equal(exists(repo, '.claude/.cc-writes'), true);
  assert.equal(exists(repo, 'sub'), false);
});

test('empty-directory cleanup removes nothing when git cannot say whether a directory is ignored', (t) => {
  const repo = makeOwnRulesRepo(t);
  mkdirSync(join(repo.dir, 'unused'));
  const failing = `
const spawn = cp.spawnSync;
cp.spawnSync = (command, args, ...rest) => (args?.[0] === 'check-ignore' ? { status: 128, stdout: '', stderr: 'fatal' } : spawn(command, args, ...rest));`;
  const result = runCreating(repo, ['plain/empty'], failing);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  for (const path of ['unused', 'plain/empty']) assert.equal(exists(repo, path), true, path);
});
