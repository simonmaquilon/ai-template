// On a file system that does not tell names apart by case, git mv refuses to rename a folder's case, so it is renamed file
// by file: the index then spells the new folder, but the folder on disk keeps its old spelling until git apply empties
// and removes it, which an ignored file in it, such as .DS_Store, prevents. Apply and revert could not tell such a fragment
// applied from reverted, so prompt-plan's record after refuses it, names each file's pair, and records nothing.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { patchPlan, startRepo } from './support.mjs';

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

// A repository whose folder Docs holds a tracked file and an ignored one, and fragment 01, which renames the folder's case
// with git mv of its one file; null where this file system tells names apart by case.
function renamedByFile(t) {
  const repo = startRepo(t, { '.gitignore': '.temp/\n.DS_Store\n', 'kept.txt': 'before\n', 'Docs/guide.md': 'guide\n', 'Docs/.DS_Store': 'finder\n' });
  if (!ignoresCase(repo.dir)) {
    t.skip('this file system tells names apart by case');
    return null;
  }
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  ok(repo.git('mv', 'Docs/guide.md', 'docs/guide.md'));
  return { repo, plan, patch };
}

test('prompt-plan case: record after refuses a folder renamed in case file by file, names the pair, and records nothing', (t) => {
  const renamed = renamedByFile(t);
  if (!renamed) return;
  const { repo, plan, patch } = renamed;
  const refused = patch('record', '01', 'after');
  assert.equal(refused.status, 1, `${refused.stdout}${refused.stderr}`);
  assert.match(refused.stderr, CANNOT_RECORD);
  assert.match(refused.stderr, UNDO_FIRST);
  assert.match(refused.stderr, REPORT_PAIRS);
  assert.equal(refused.stderr.match(/outside every patch/g).length, 1);
  assert.doesNotMatch(refused.stderr, /earlier fragment/);
  assert.match(refused.stderr, /Docs\/guide\.md[^\n]*docs\/guide\.md/);
  assert.doesNotMatch(refused.stderr, /DS_Store|^\s+at /m);
  for (const name of ['01.patch', '01.state']) assert.equal(existsSync(join(plan, 'patch', name)), false, name);
  assert.equal(readFileSync(join(repo.dir, 'Docs', '.DS_Store'), 'utf8'), 'finder\n');
});

test('prompt-plan case: a folder renamed in case file by file records once git mv puts the old spelling back, and the next fragment starts', (t) => {
  const renamed = renamedByFile(t);
  if (!renamed) return;
  const { repo, plan, patch } = renamed;
  ok(repo.git('mv', 'docs/guide.md', 'Docs/guide.md'));
  repo.write('kept.txt', 'changed\n');
  ok(patch('record', '01', 'after'));
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8')).files), ['kept.txt']);
  const started = patch('record', '02', 'before');
  ok(started);
  assert.match(started.stdout, /Fragment 02: initial state recorded/);
});
