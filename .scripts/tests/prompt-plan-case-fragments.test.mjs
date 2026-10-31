// On a file system that does not tell names apart by case, the index keeps the spelling a name had, so a name one fragment
// deletes and a later one adds in another case stands on disk under a spelling that no record of the pair tells applied
// from reverted. It is no rename of one fragment, and prompt-plan's record after refuses it all the same, names each pair
// with the earlier fragment, and writes nothing; --include already refuses a name that differs only in case from one an
// earlier fragment adopted.

import assert from 'node:assert/strict';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const CANNOT_RECORD = /a rename that only changes case, of a file or of a folder, cannot be recorded on this file system, since apply and revert cannot replay it/;
// What the refusal tells the agent to do about a pair across fragments, which no git mv back can undo, about a rename
// within the fragment, and, said once for every pair of either kind, about reporting it; the \u26a0\ufe0f is the report
// marker, escaped because it holds an invisible variation selector.
const SPELL_AS_RECORDED = /write the file under the spelling the earlier fragment recorded, or leave the rename until after closing, once no fragment remains to run, by the user or through a commit the prompt authorizes then/;
const UNDO_FIRST = /undo the rename by moving the file back to the old spelling, for example with git mv, record again, and make the rename after closing, once no fragment remains to run, by the user or through a commit the prompt authorizes then/;
const REPORT_PAIRS = /Report every pair above as \u26a0\ufe0f outside every patch\./;

function ignoresCase(dir) {
  writeFileSync(join(dir, 'Probe'), '');
  const found = existsSync(join(dir, 'probe'));
  rmSync(join(dir, 'Probe'));
  return found;
}

const skipped = (t, repo) => {
  const skip = !ignoresCase(repo.dir);
  if (skip) t.skip('this file system tells names apart by case');
  return skip;
};
const writesNothing = (plan, number) => {
  for (const extension of ['patch', 'state']) assert.equal(existsSync(join(plan, 'patch', `${number}.${extension}`)), false, extension);
};

test('prompt-plan case: record after refuses a name an earlier fragment deleted and this one adds in another case', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'Notes.md': 'notes\n' });
  if (skipped(t, repo)) return;
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  ok(repo.git('rm', '-q', 'Notes.md'));
  ok(patch('record', '01', 'after'));
  ok(patch('record', '02', 'before'));
  repo.write('notes.md', 'new\n');
  const refused = patch('record', '02', 'after', '--include', 'notes.md');
  assert.equal(refused.status, 1, `${refused.stdout}${refused.stderr}`);
  assert.match(refused.stderr, CANNOT_RECORD);
  assert.match(refused.stderr, SPELL_AS_RECORDED);
  assert.doesNotMatch(refused.stderr, /git mv|moving the file back/);
  assert.match(refused.stderr, REPORT_PAIRS);
  assert.equal(refused.stderr.match(/outside every patch/g).length, 1);
  assert.match(refused.stderr, /^ {2}earlier fragment 01: Notes\.md -> notes\.md$/m);
  assert.doesNotMatch(refused.stderr, /^\s+at /m);
  writesNothing(plan, '02');
  assert.equal(existsSync(join(plan, 'patch', '02.before')), true);
  // The name in the spelling the earlier fragment deleted it by is no such pair, and records on the second try.
  rmSync(join(repo.dir, 'notes.md'));
  repo.write('Notes.md', 'new\n');
  ok(patch('record', '02', 'after', '--include', 'Notes.md'));
});

test('prompt-plan case: --include refuses a name in another case than one an earlier fragment adopted, and records nothing', (t) => {
  const repo = startRepo(t);
  if (skipped(t, repo)) return;
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('notes.md', 'notes\n');
  ok(patch('record', '01', 'after', '--include', 'notes.md'));
  ok(patch('record', '02', 'before'));
  rmSync(join(repo.dir, 'notes.md'));
  repo.write('Notes.md', 'new\n');
  const refused = patch('record', '02', 'after', '--include', 'Notes.md');
  assert.equal(refused.status, 1, `${refused.stdout}${refused.stderr}`);
  assert.match(refused.stderr, /differ from a path of the before snapshot only in case[^\n]*\n {2}Notes\.md$/m);
  assert.doesNotMatch(refused.stderr, /^\s+at /m);
  writesNothing(plan, '02');
});

// One git mv of a name an earlier fragment recorded is a rename within the fragment and a pair with that fragment's
// spelling, so the refusal gives the way out of each, and the first needs the pairs listed above it.
test('prompt-plan case: record after gives the way out of both kinds of pair when one git mv makes them', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'notes.md': 'notes\n' });
  if (skipped(t, repo)) return;
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('notes.md', 'changed\n');
  ok(patch('record', '01', 'after'));
  ok(patch('record', '02', 'before'));
  ok(repo.git('mv', 'notes.md', 'NOTES.md'));
  const refused = patch('record', '02', 'after');
  assert.equal(refused.status, 1, `${refused.stdout}${refused.stderr}`);
  assert.match(refused.stderr, /^ {2}notes\.md -> NOTES\.md\n {2}earlier fragment 01: notes\.md -> NOTES\.md\n/m);
  assert.match(refused.stderr, /\n[^\n]*for a pair that names no earlier fragment, undo the rename/);
  assert.match(refused.stderr, UNDO_FIRST);
  assert.match(refused.stderr, SPELL_AS_RECORDED);
  // The report covers the pairs of both kinds, so it follows the advice for both.
  assert.match(refused.stderr, /for a pair that names one, write[^\n]*\. Report every pair above as/);
  assert.match(refused.stderr, REPORT_PAIRS);
  assert.equal(refused.stderr.match(/outside every patch/g).length, 1);
  assert.doesNotMatch(refused.stderr, /^\s+at /m);
  writesNothing(plan, '02');
});
