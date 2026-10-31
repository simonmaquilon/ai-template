// The scripts ask the file system that holds the working tree whether it ignores case, whatever core.ignorecase says. A
// linked worktree and a repository with a separate git directory keep their git directory somewhere else, which need not
// be on that file system, so the question goes to the working tree's own .git entry, a folder or a file that names the
// git directory, and to the git directory only for a working tree with no .git entry at all.

import assert from 'node:assert/strict';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { patchPlan, run, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

function tellsCase(dir) {
  writeFileSync(join(dir, 'Probe'), '');
  const found = existsSync(join(dir, 'probe'));
  rmSync(join(dir, 'Probe'));
  return found;
}

// A repository that says names differ by case, on a file system that ignores it; null where the file system tells names
// apart by case, so that the configuration is right.
function misconfigured(t) {
  const repo = startRepo(t);
  if (!tellsCase(repo.dir)) {
    t.skip('this file system tells names apart by case');
    return null;
  }
  ok(repo.git('config', 'core.ignorecase', 'false'));
  return repo;
}

// What ignoresCase gives for the plan in a working tree, started from it, with env added.
function asked(dir, env = {}) {
  const { plan } = patchPlan({ dir }, []);
  const script = `import { pathToFileURL } from 'node:url';
const common = await import(pathToFileURL(${JSON.stringify(join(plan, 'patch', 'common.mjs'))}).href);
console.log(common.ignoresCase());`;
  const answered = run(process.execPath, ['--input-type=module', '-e', script], { cwd: dir, env: { ...process.env, ...env } });
  ok(answered);
  return answered.stdout.trim();
}

test('prompt-plan case probe: a linked worktree is told to ignore case whatever the configuration says', (t) => {
  const repo = misconfigured(t);
  if (!repo) return;
  const worktree = `${repo.dir}-linked`;
  t.after(() => rmSync(worktree, { recursive: true, force: true, maxRetries: 5 }));
  ok(repo.git('worktree', 'add', '-q', '-b', 'side', worktree));
  assert.equal(asked(worktree), 'true');
});

test('prompt-plan case probe: a repository with a separate git directory is told to ignore case whatever the configuration says', (t) => {
  const repo = misconfigured(t);
  if (!repo) return;
  const gitDir = `${repo.dir}-gitdir`;
  t.after(() => rmSync(gitDir, { recursive: true, force: true, maxRetries: 5 }));
  ok(repo.git('init', '-q', `--separate-git-dir=${gitDir}`));
  assert.equal(existsSync(join(gitDir, 'HEAD')), true);
  assert.equal(asked(repo.dir), 'true');
});

// With no .git entry in the working tree, as when GIT_DIR and GIT_WORK_TREE name the repository, the git directory is asked.
test('prompt-plan case probe: a working tree with no .git entry is asked through the git directory', (t) => {
  const repo = misconfigured(t);
  if (!repo) return;
  const gitDir = `${repo.dir}-gitdir`;
  t.after(() => rmSync(gitDir, { recursive: true, force: true, maxRetries: 5 }));
  ok(repo.git('init', '-q', `--separate-git-dir=${gitDir}`));
  rmSync(join(repo.dir, '.git'));
  assert.equal(asked(repo.dir, { GIT_DIR: gitDir, GIT_WORK_TREE: repo.dir }), 'true');
});
