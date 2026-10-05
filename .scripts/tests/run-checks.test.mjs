import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, WINDOWS, makeRepo, run } from './support.mjs';

// Unreadable or unwritable folders block the checks the way a sandbox does;
// Windows and root read and write them anyway.
const unenforced = WINDOWS || process.getuid?.() === 0;

// A throwaway repository with what the steps read, so the result never depends
// on the working tree of the repository that holds the tests.
function fixture(t) {
  const repo = makeRepo(t);
  for (const path of ['skills-lock.json', '.gitattributes', join('.agents', 'skills', 'security-audit')]) {
    cpSync(join(ROOT, path), join(repo.dir, path), { recursive: true });
  }
  mkdirSync(join(repo.dir, '.scripts', 'tests'));
  mkdirSync(join(repo.dir, '.temp'));
  repo.git('add', '--', '.');
  repo.git('commit', '-q', '-m', 'fixture');
  return repo;
}

const checks = (repo, env = {}) => run(process.execPath, [join('.scripts', 'run-checks.mjs')], {
  cwd: repo.dir,
  env: { ...process.env, ...env },
  maxBuffer: 64 * 1024 * 1024,
});

test('run-checks reports the hook tests as blocked, not failed, where git cannot create a repository', { skip: unenforced }, (t) => {
  const repo = fixture(t);
  const templates = mkdtempSync(join(ROOT, '.temp', 'git-template-'));
  const locked = join(templates, 'hooks', 'locked.sample');
  t.after(() => {
    chmodSync(locked, 0o600);
    rmSync(templates, { recursive: true, force: true, maxRetries: 5 });
  });
  mkdirSync(join(templates, 'hooks'));
  writeFileSync(locked, '');
  chmodSync(locked, 0);
  const result = checks(repo, { GIT_TEMPLATE_DIR: templates });
  assert.match(result.stdout, /^BLOCKED hook tests: git cannot create a repository here/m);
  assert.doesNotMatch(result.stdout, /^FAIL /m);
  assert.equal(result.status, 3, result.stdout + result.stderr);
});

test('run-checks reports the steps that need .temp as blocked, not failed, where it cannot write there', { skip: unenforced }, (t) => {
  const repo = fixture(t);
  const temp = join(repo.dir, '.temp');
  chmodSync(temp, 0o500);
  const result = checks(repo);
  chmodSync(temp, 0o700);
  assert.match(result.stdout, /^BLOCKED hook tests: cannot write under \.temp/m);
  assert.match(result.stdout, /^BLOCKED security-audit skill tests: cannot write under \.temp/m);
  assert.match(result.stdout, /^PASS documentation links$/m);
  assert.doesNotMatch(result.stdout, /^FAIL /m);
  assert.equal(result.status, 3, result.stdout + result.stderr);
});
