// A write checks that every file its patch deletes is gone, since git apply only warns when it cannot unlink one. A path
// read through a link in one of its folders is another file, so where a patch replaces a folder by a link, or a link by a
// folder, a file of the same name in the link's target must not pass for the one the patch deleted.

import assert from 'node:assert/strict';
import { chmodSync, lstatSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const skip = WINDOWS && 'symbolic links need privileges on Windows';
const unwritable = (WINDOWS || process.getuid?.() === 0) && 'needs a folder its owner cannot write';

// A repository with a tracked docs, which is the link to site/docs or, with real, a folder that holds a.md; site/docs
// holds a.md as well when docs is the link.
function setUp(t, real) {
  const repo = startRepo(t, { 'kept.txt': 'before\n', ...(real ? { 'docs/a.md': 'docs\n', 'site/docs/b.md': 'b\n' } : { 'site/docs/a.md': 'site\n' }) });
  if (!real) {
    symlinkSync('site/docs', join(repo.dir, 'docs'));
    ok(repo.git('add', 'docs'));
    ok(repo.git('commit', '-q', '-m', 'link'));
  }
  return { repo, ...patchPlan(repo, ['01']) };
}

test('prompt-plan link folder: revert of a link replaced by a folder succeeds although the link leads to a file of that name', { skip }, (t) => {
  const { repo, patch } = setUp(t, false);
  ok(patch('record', '01', 'before'));
  rmSync(join(repo.dir, 'docs'));
  repo.write('docs/a.md', 'mine\n');
  ok(patch('record', '01', 'after', '--include', 'docs/a.md'));
  const reverted = patch('revert', '01');
  ok(reverted);
  assert.match(reverted.stdout, /reverted/);
  assert.doesNotMatch(reverted.stderr, /part of that fragment's patch|still stand/);
  assert.ok(lstatSync(join(repo.dir, 'docs')).isSymbolicLink());
  assert.equal(readFileSync(join(repo.dir, 'site', 'docs', 'a.md'), 'utf8'), 'site\n');
});

// The other way round, a folder replaced by a link to a folder that holds the same names once the fragment is reverted;
// the file is made after the revert, since revert and apply read a recorded path through a link, and refuse one that a
// file of the link's target seems to hold.
test('prompt-plan link folder: apply of a folder replaced by a link gives no partial-write refusal although the link leads to a file of that name', { skip }, (t) => {
  const { repo, patch } = setUp(t, true);
  ok(patch('record', '01', 'before'));
  rmSync(join(repo.dir, 'docs'), { recursive: true });
  symlinkSync('site/docs', join(repo.dir, 'docs'));
  ok(patch('record', '01', 'after', '--include', 'docs'));
  ok(patch('revert', '01'));
  assert.equal(readFileSync(join(repo.dir, 'docs', 'a.md'), 'utf8'), 'docs\n');
  repo.write('site/docs/a.md', 'site\n');
  const applied = patch('apply', '01');
  ok(applied);
  assert.doesNotMatch(applied.stderr, /part of that fragment's patch|still stand/);
  assert.ok(lstatSync(join(repo.dir, 'docs')).isSymbolicLink());
  assert.equal(readFileSync(join(repo.dir, 'site', 'docs', 'a.md'), 'utf8'), 'site\n');
});

// A fragment that replaced a link by a folder has the files in the folder adopted. Once it is reverted the link stands
// again and those paths lie under it, where git cannot add them to an index, and a file of the same name in the link's
// target is another file, which no snapshot holds. Neither may make the snapshot fail, or a path of the fragment unseen.
function replaced(t) {
  const { repo, patch } = setUp(t, false);
  ok(patch('record', '01', 'before'));
  rmSync(join(repo.dir, 'docs'));
  repo.write('docs/a.md', 'mine\n');
  ok(patch('record', '01', 'after', '--include', 'docs/a.md'));
  return { repo, patch };
}
function intact(repo) {
  assert.ok(lstatSync(join(repo.dir, 'docs')).isSymbolicLink());
  assert.equal(readFileSync(join(repo.dir, 'site', 'docs', 'a.md'), 'utf8'), 'site\n');
}

test('prompt-plan link folder: revert and apply of a link replaced by a folder match no unseen file although the link leads to an adopted name', { skip }, (t) => {
  const { repo, patch } = replaced(t);
  ok(patch('revert', '01'));
  intact(repo);
  const again = patch('revert', '01');
  ok(again);
  assert.match(again.stdout, /already reverted/);
  intact(repo);
  const applied = patch('apply', '01');
  ok(applied);
  assert.match(applied.stdout, /01: applied\./);
  assert.ok(lstatSync(join(repo.dir, 'docs')).isDirectory());
  assert.equal(readFileSync(join(repo.dir, 'docs', 'a.md'), 'utf8'), 'mine\n');
  assert.equal(readFileSync(join(repo.dir, 'site', 'docs', 'a.md'), 'utf8'), 'site\n');
});

// The file in the link's target is removed first, so that only the snapshot is at stake, and not the position check.
test('prompt-plan link folder: apply after the revert of a link replaced by a folder captures the snapshot although an adopted name lies under the link', { skip }, (t) => {
  const { repo, patch } = replaced(t);
  ok(patch('revert', '01'));
  rmSync(join(repo.dir, 'site', 'docs', 'a.md'));
  const applied = patch('apply', '01');
  ok(applied);
  assert.doesNotMatch(applied.stderr, /could not be captured/);
  assert.ok(lstatSync(join(repo.dir, 'docs')).isDirectory());
  assert.equal(readFileSync(join(repo.dir, 'docs', 'a.md'), 'utf8'), 'mine\n');
  const reverted = patch('revert', '01');
  ok(reverted);
  assert.match(reverted.stdout, /01: reverted\./);
  assert.ok(lstatSync(join(repo.dir, 'docs')).isSymbolicLink());
});

// git apply only warns that it cannot remove the link, in a folder nobody can write, and then creates the files of the
// folder that replaces it through the link, into its target, over a file of the same name there. The link goes first, as
// its own pass, and the patch goes no further while it stands.
test('prompt-plan link folder: apply of a link replaced by a folder refuses without writing into the link target when git cannot remove the link', { skip: skip || unwritable }, (t) => {
  const { repo, patch } = replaced(t);
  ok(patch('revert', '01'));
  chmodSync(repo.dir, 0o555);
  let applied;
  try {
    applied = patch('apply', '01');
  } finally {
    chmodSync(repo.dir, 0o755);
  }
  assert.equal(applied.status, 1, `${applied.stdout}${applied.stderr}`);
  assert.match(applied.stderr, /git failed while writing its patch, so the working tree may now hold part of that fragment's patch[^\n]*\n[\s\S]*still stand:\n {2}docs\n/);
  assert.doesNotMatch(applied.stdout, /applied/);
  intact(repo);
});
