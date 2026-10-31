// On a file system that does not tell names apart by case, git records no rename that only changes case when a plain mv
// makes it, so prompt-plan's record after reports each one instead of leaving it silently out of the patch. A git mv that
// only changes case is recorded as a deletion and an addition, but git apply never renames on disk there, so apply and
// revert could not tell such a fragment applied from reverted: record after refuses it, names each pair, and writes
// nothing, while record restore still puts the old name back, with the deletion written before the rest.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { patchPlan, run, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const CANNOT_RECORD = /a rename that only changes case, of a file or of a folder, cannot be recorded on this file system, since apply and revert cannot replay it/;
// What the refusal tells the agent to do: for a rename within the fragment, move the file back and make the rename after
// closing, once no fragment remains to run, by the user or through a commit the prompt authorizes then, and, for every
// pair, report it as outside every patch, said once; the \u26a0\ufe0f is the report marker, escaped because it holds an
// invisible variation selector.
const UNDO_FIRST = /undo the rename by moving the file back to the old spelling, for example with git mv, record again, and make the rename after closing, once no fragment remains to run, by the user or through a commit the prompt authorizes then/;
const REPORT_PAIRS = /Report every pair above as \u26a0\ufe0f outside every patch\./;

function ignoresCase(dir) {
  writeFileSync(join(dir, 'Probe'), '');
  const found = existsSync(join(dir, 'probe'));
  rmSync(join(dir, 'Probe'));
  return found;
}

test('prompt-plan case: record after reports files and folders renamed only in case', (t) => {
  const repo = startRepo(t, { 'readme.md': 'readme\n', 'Docs/guide.md': 'guide\n' });
  if (!ignoresCase(repo.dir)) {
    t.skip('this file system tells names apart by case');
    return;
  }
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  renameSync(join(repo.dir, 'readme.md'), join(repo.dir, 'README.md'));
  renameSync(join(repo.dir, 'Docs'), join(repo.dir, 'docs'));
  repo.write('README.md', 'changed\n');
  const after = patch('record', '01', 'after');
  ok(after);
  assert.match(after.stdout, /readme\.md[^\n]*README\.md/);
  assert.match(after.stdout, /Docs[^\n]*docs/);
  // A renamed folder is one line, not one per file in it.
  assert.doesNotMatch(after.stdout, /guide\.md/);
});

const spellings = (repo, name = 'notes.md') => readdirSync(repo.dir).filter((entry) => entry.toLowerCase() === name.toLowerCase());
const skipped = (t, repo) => {
  const skip = !ignoresCase(repo.dir);
  if (skip) t.skip('this file system tells names apart by case');
  return skip;
};

// git mv of a tracked file to a case-only new name is the old name removed and the new name added, which no replay of a
// patch can tell applied from reverted, so the agent undoes it and records; the before record stays for that second try.
test('prompt-plan case: record after refuses a git mv that only changes case, names each pair, and records nothing', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'notes.md': 'notes\n', 'todo.md': 'todo\n' });
  if (skipped(t, repo)) return;
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  ok(repo.git('mv', 'notes.md', 'NOTES.md'));
  ok(repo.git('mv', 'todo.md', 'TODO.md'));
  repo.write('kept.txt', 'changed\n');
  const refused = patch('record', '01', 'after');
  assert.equal(refused.status, 1, `${refused.stdout}${refused.stderr}`);
  assert.match(refused.stderr, CANNOT_RECORD);
  assert.match(refused.stderr, UNDO_FIRST);
  assert.match(refused.stderr, REPORT_PAIRS);
  assert.equal(refused.stderr.match(/outside every patch/g).length, 1);
  assert.doesNotMatch(refused.stderr, /earlier fragment/);
  for (const pair of [/notes\.md[^\n]*NOTES\.md/, /todo\.md[^\n]*TODO\.md/]) assert.match(refused.stderr, pair);
  assert.doesNotMatch(refused.stderr, /kept\.txt|^\s+at /m);
  for (const name of ['01.patch', '01.state']) assert.equal(existsSync(join(plan, 'patch', name)), false, name);
  assert.equal(existsSync(join(plan, 'patch', '01.before')), true);
  ok(repo.git('mv', 'NOTES.md', 'notes.md'));
  ok(repo.git('mv', 'TODO.md', 'todo.md'));
  ok(patch('record', '01', 'after'));
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8')).files), ['kept.txt']);
  ok(patch('record', '02', 'before'));
});

// A name with a character that git apply's --include and --exclude patterns read as one of theirs must name only itself.
for (const [old, renamed] of [['notes.md', 'NOTES.md'], ['n[1].md', 'N[1].md']]) {
  test(`prompt-plan case: restore puts back ${old}, which a failed fragment changed only in case with git mv`, (t) => {
    const repo = startRepo(t, { 'kept.txt': 'before\n', [old]: 'notes\n' });
    if (skipped(t, repo)) return;
    const { patch } = patchPlan(repo, ['01']);
    ok(patch('record', '01', 'before'));
    ok(repo.git('mv', old, renamed));
    repo.write('kept.txt', 'changed\n');
    ok(patch('record', '01', 'restore'));
    assert.deepEqual(spellings(repo, old), [old]);
    assert.equal(readFileSync(join(repo.dir, old), 'utf8'), 'notes\n');
    assert.equal(readFileSync(join(repo.dir, 'kept.txt'), 'utf8'), 'before\n');
  });
}

// The deletion goes first because the rest cannot be checked before it; if the rest does not apply, the deletion is undone.
// No record carries such a rename, so the patch back is made as a restore makes it, from the snapshot of the git mv.
test('prompt-plan case: when the rest of a case-only rename patch does not apply, nothing stays half-written', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'notes.md': 'notes\n' });
  if (skipped(t, repo)) return;
  const { plan } = patchPlan(repo, ['01']);
  ok(repo.git('mv', 'notes.md', 'NOTES.md'));
  repo.write('kept.txt', 'changed\n');
  // The line the patch changes reads otherwise by then, so that hunk fails in the check of the second pass.
  const script = `import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const common = await import(pathToFileURL(${JSON.stringify(join(plan, 'patch', 'common.mjs'))}).href);
const initial = common.git(['rev-parse', 'HEAD^{tree}']).trim();
const { tree: now } = common.snapshotTree();
const changes = common.rawChanges(now, initial);
writeFileSync(common.patchFile('01'), common.git([...common.PATCH, now, initial], { binary: true, env: common.storeEnv() }));
writeFileSync('kept.txt', 'other\\n');
try {
  common.writePatch(common.patchFile('01'), changes);
} catch (error) {
  console.log(error.message);
}`;
  const written = run(process.execPath, ['--input-type=module', '-e', script], { cwd: repo.dir });
  ok(written);
  // The check that failed is the second pass, which excludes the deletion the first one wrote.
  assert.match(written.stdout, /apply --check[^\n]*--exclude=NOTES\.md[^\n]*\n[^\n]*kept\.txt/);
  assert.deepEqual(spellings(repo), ['NOTES.md']);
  assert.equal(readFileSync(join(repo.dir, 'NOTES.md'), 'utf8'), 'notes\n');
  assert.equal(readFileSync(join(repo.dir, 'kept.txt'), 'utf8'), 'other\n');
});
