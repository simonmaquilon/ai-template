// A patch git apply fails to write after its check passed, such as one into a folder the owner cannot write, may leave
// part of the patch in the working tree, so apply, revert, and restore say that instead of saying the fragment stays
// applied or unapplied, which a failed check alone leaves true.

import assert from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { patchPlan, run, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const unwritable = (process.platform === 'win32' || process.getuid?.() === 0) && 'needs a folder its owner cannot write';
const PARTIAL = /the working tree may now hold part of that fragment's patch[^\n]*\n[\s\S]*locked\//;

function refused(result, pattern) {
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, pattern);
  assert.doesNotMatch(result.stderr, /stays? (applied|unapplied)|^\s+at /m);
}

// A repository whose fragment 01 edits locked/f.txt, with the one folder it must write into locked from here on; the
// caller unlocks it by chmod.
function lockedAfterRecord(t) {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'locked/f.txt': 'before\n' });
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('locked/f.txt', 'changed\n');
  return { repo, patch };
}

function locked(repo, run) {
  chmodSync(join(repo.dir, 'locked'), 0o555);
  try {
    return run();
  } finally {
    chmodSync(join(repo.dir, 'locked'), 0o755);
  }
}

test('prompt-plan partial: revert says the working tree may hold part of the patch when its write fails after the check', { skip: unwritable }, (t) => {
  const { repo, patch } = lockedAfterRecord(t);
  ok(patch('record', '01', 'after'));
  refused(locked(repo, () => patch('revert', '01')), PARTIAL);
});

test('prompt-plan partial: apply says the working tree may hold part of the patch when its write fails after the check', { skip: unwritable }, (t) => {
  const { repo, patch } = lockedAfterRecord(t);
  ok(patch('record', '01', 'after'));
  ok(patch('revert', '01'));
  refused(locked(repo, () => patch('apply', '01')), PARTIAL);
});

test('prompt-plan partial: restore says the working tree may hold part of the patch when its write fails after the check', { skip: unwritable }, (t) => {
  const { repo, patch } = lockedAfterRecord(t);
  refused(locked(repo, () => patch('record', '01', 'restore')), PARTIAL);
});

// git apply only warns that it is unable to unlink a file it deletes, as in a folder the owner cannot write, and exits 0,
// so a write that deletes files must find them gone; otherwise revert says reverted while the file stands, and apply and
// revert refuse the mix of states from then on.
test('prompt-plan partial: revert names the adopted file git could not delete instead of reporting the fragment reverted', { skip: unwritable }, (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n' });
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'changed\n');
  repo.write('locked/new.txt', 'new\n');
  ok(patch('record', '01', 'after', '--include', 'locked/new.txt'));
  const reverted = locked(repo, () => patch('revert', '01'));
  refused(reverted, /the working tree may now hold part of that fragment's patch[^\n]*\n[\s\S]*locked\/new\.txt/);
  assert.doesNotMatch(reverted.stdout, /reverted/);
  assert.equal(readFileSync(join(repo.dir, 'locked', 'new.txt'), 'utf8'), 'new\n');
});

// A restore of a name a failed fragment changed only in case with git mv goes in two passes where the file system ignores
// case, and the first deletes. In a folder the owner cannot write git apply only warns that it cannot unlink, so the new
// name stays, and the first pass names it: no addition is written yet, so the name that stands is no addition's file but
// the one the deletion left behind, and the pass must not go on to the rest.
test('prompt-plan partial: a restore of a case-only rename whose first pass git cannot perform names the file that stands', { skip: unwritable }, (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'locked/notes.md': 'notes\n' });
  if (!existsSync(join(repo.dir, 'LOCKED'))) {
    t.skip('this file system tells names apart by case');
    return;
  }
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  ok(repo.git('mv', 'locked/notes.md', 'locked/NOTES.md'));
  const restored = locked(repo, () => patch('record', '01', 'restore'));
  refused(restored, PARTIAL);
  // The file that stands is the name the restore deletes first, which the folder's lock kept git from unlinking.
  assert.match(restored.stderr, /git could not delete these files, which the patch removes and which still stand:\n {2}locked\/NOTES\.md/);
  assert.doesNotMatch(restored.stderr, /Undoing the deletions/);
  assert.equal(readFileSync(join(repo.dir, 'locked', 'NOTES.md'), 'utf8'), 'notes\n');
});

// The scripts only reach a check that fails when the files match a recorded state the patch does not apply to, so the
// error is taken from writePatch itself.
test('prompt-plan partial: a patch whose check fails is no partial write', (t) => {
  const { repo, patch } = lockedAfterRecord(t);
  ok(patch('record', '01', 'after'));
  repo.write('locked/f.txt', 'other\n');
  const script = `import { pathToFileURL } from 'node:url';
const common = await import(pathToFileURL(${JSON.stringify(join(repo.dir, '.temp', 'plans', 'p', 'patch', 'common.mjs'))}).href);
try {
  common.writePatch(common.patchFile('01'), common.reversed(common.loadState('01').files), { reverse: true });
} catch (error) {
  console.log(\`\${error.constructor.name}: \${error.message}\`);
}`;
  const written = run(process.execPath, ['--input-type=module', '-e', script], { cwd: repo.dir });
  ok(written);
  assert.match(written.stdout, /^Error: git apply -R --check[^\n]*\n[^\n]*locked\/f\.txt/);
  assert.equal(readFileSync(join(repo.dir, 'locked', 'f.txt'), 'utf8'), 'other\n');
});
