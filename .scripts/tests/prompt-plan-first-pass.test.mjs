// A patch that replaces a link by a folder goes in two passes: the deletions of the paths the additions lie under, confirmed
// gone, then the rest, checked before it is written. Whichever way the first pass or the second ends short, no deletion of
// the first pass stays written, and the refusal says what is left.

import assert from 'node:assert/strict';
import { chmodSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { WINDOWS, patchPlan, run, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const skip = WINDOWS && 'symbolic links need privileges on Windows';
const unwritable = (WINDOWS || process.getuid?.() === 0) && 'needs a folder its owner cannot write';
const LINKS = { docs: 'site/docs', 'locked/lib': '../site/lib' };

// A repository with a tracked link for each given name of LINKS, and fragment 01, which replaces each by a folder holding
// the adopted file a.md and edits kept.txt; the fragment is recorded and reverted, so the links stand again.
function reverted(t, names) {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'site/docs/x.md': 'x\n', 'site/lib/y.md': 'y\n' });
  for (const name of names) {
    mkdirSync(dirname(join(repo.dir, name)), { recursive: true });
    symlinkSync(LINKS[name], join(repo.dir, name));
    ok(repo.git('add', name));
  }
  ok(repo.git('commit', '-q', '-m', 'links'));
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  for (const name of names) {
    rmSync(join(repo.dir, name));
    repo.write(`${name}/a.md`, `${name}\n`);
  }
  repo.write('kept.txt', 'changed\n');
  ok(patch('record', '01', 'after', ...names.flatMap((name) => ['--include', `${name}/a.md`])));
  ok(patch('revert', '01'));
  return { repo, plan, patch };
}

// Whether the name is the link it was, which a deletion undone brings back.
const linked = (repo, name) => lstatSync(join(repo.dir, name), { throwIfNoEntry: false })?.isSymbolicLink() === true
  && readlinkSync(join(repo.dir, name)) === LINKS[name];
const targetsIntact = (repo) => {
  assert.deepEqual(readdirSync(join(repo.dir, 'site', 'docs')), ['x.md']);
  assert.equal(readFileSync(join(repo.dir, 'site', 'docs', 'x.md'), 'utf8'), 'x\n');
};

// The scripts only reach a check that fails when the files match a recorded state the patch does not apply to, and apply
// refuses a corrupted kept.txt at its position check, so the error is taken from writePatch itself.
test('prompt-plan first pass: a link the first pass deleted is put back when the rest of the patch does not apply', { skip }, (t) => {
  const { repo, plan } = reverted(t, ['docs']);
  writeFileSync(join(repo.dir, 'kept.txt'), 'corrupted\n');
  const script = `import { pathToFileURL } from 'node:url';
const common = await import(pathToFileURL(${JSON.stringify(join(plan, 'patch', 'common.mjs'))}).href);
try {
  common.writePatch(common.patchFile('01'), common.loadState('01').files);
} catch (error) {
  console.log(\`\${error.constructor.name}: \${error.message}\`);
}`;
  const written = run(process.execPath, ['--input-type=module', '-e', script], { cwd: repo.dir });
  ok(written);
  // The check that failed is the second pass, which excludes the link the first one deleted; the undoing did not fail.
  assert.match(written.stdout, /^Error: git apply --check[^\n]*--exclude=docs[^\n]*\n[\s\S]*kept\.txt: patch does not apply/);
  assert.ok(linked(repo, 'docs'), 'docs is not the link it was');
  targetsIntact(repo);
  assert.equal(readFileSync(join(repo.dir, 'kept.txt'), 'utf8'), 'corrupted\n');
});

// git apply only warns that it cannot unlink a file in a folder the owner cannot write, and exits 0. Of two links the first
// pass deletes, the one in such a folder stands, and the other, deleted, must not stay deleted: the first pass leaves
// nothing written, although it is still a partial write that the refusal reports.
test('prompt-plan first pass: apply puts back the link it deleted when git cannot delete another one', { skip: skip || unwritable }, (t) => {
  const { repo, patch } = reverted(t, ['docs', 'locked/lib']);
  chmodSync(join(repo.dir, 'locked'), 0o555);
  let applied;
  try {
    applied = patch('apply', '01');
  } finally {
    chmodSync(join(repo.dir, 'locked'), 0o755);
  }
  assert.equal(applied.status, 1, `${applied.stdout}${applied.stderr}`);
  assert.match(applied.stderr, /the working tree may now hold part of that fragment's patch[^\n]*\n[\s\S]*still stand:\n {2}locked\/lib\n/);
  assert.doesNotMatch(applied.stderr, /Undoing the deletions|^\s+at /m);
  assert.doesNotMatch(applied.stdout, /applied/);
  assert.ok(linked(repo, 'docs'), 'docs is not the link it was');
  assert.ok(linked(repo, 'locked/lib'), 'locked/lib is not the link it was');
  targetsIntact(repo);
  assert.equal(readFileSync(join(repo.dir, 'kept.txt'), 'utf8'), 'before\n');
});
