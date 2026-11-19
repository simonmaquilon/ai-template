// The execution rules that the rewrite of references/execution.md and SKILL.md after 6.2.0 must still carry, one per
// line, in the current vocabulary: identifiers such as [P-01] and no marks of a question asked or an acceptance.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT } from './support.mjs';

const SKILL = join(ROOT, '.agents', 'skills', 'prompt-plan');
const read = (path) => readFileSync(join(SKILL, path), 'utf8');
const EXECUTION = read('references/execution.md');
const SKILL_FILE = read('SKILL.md');
const rules = (text) => text.split('\n').filter((line) => line.startsWith('- '));
const carries = (text, ...patterns) => rules(text).some((line) => patterns.every((pattern) => pattern.test(line)));

test('guidance requires execution.md to keep the stop rules of a test that passes without evidence, a mismatched state, and a corrected implementation', () => {
  assert.ok(carries(EXECUTION, /already passes before/, /without (?:that )?red evidence/, /guard fails/, /without running `record NN after`/, /`blocked` until the user decides/));
  assert.ok(carries(EXECUTION, /`NN\.state`/, /did not write/, /another session/, /--leave-tracked/, /⏳ line/, /`blocked` until the user decides/, /patch keeps/));
  assert.ok(carries(EXECUTION, /implementation/, /never changes[^.]*criteria, tests, or checks/, /except as `check\/` allows/));
  assert.doesNotMatch(EXECUTION, /report any mismatch/);
});

test('guidance requires execution.md to keep the rules on a revised answer and on a choice left to the executor', () => {
  assert.ok(carries(EXECUTION, /revised answer/, /right after its `record NN before`/, /checks and tests of `done` fragments/, /as strict as before/, /restoring or dropping[^.]*undoes/));
  assert.ok(carries(EXECUTION, /leaves to the executor/, /first fragment[^.]*governs/, /before that fragment's tests/, /reason/, /naming the executor/));
});

test('guidance requires execution.md to keep the rules on a review question and on the fragments left over at the end of an execution', () => {
  assert.ok(carries(EXECUTION, /question a review asks/, /⏳ line/, /execution goes on/, /`blocked`/));
  assert.ok(carries(EXECUTION, /fragment that is not `done`/, /⏳ line/, /`failed` or `blocked`/, /`pending`/));
});

test('guidance requires SKILL.md to keep the authorization of a chosen step and to drop the acceptance it cannot verify', () => {
  assert.ok(carries(SKILL_FILE, /answer that chooses a pending step/, /user's authorization for that step alone/));
  assert.ok(carries(SKILL_FILE, /ends only as the Ending an execution rules/, /left visible/));
  assert.doesNotMatch(SKILL_FILE, /accepted by the user/);
  assert.doesNotMatch(`${SKILL_FILE}\n${EXECUTION}`, /\[(?:asked|accepted by) the user/);
});
