// The rules that keep a ⚠️ warning of prompt-plan from stopping the work unless it really prevents it: the adversarial triage,
// the ℹ️ report of what does not block, the one question to execute, and the one question that closes the warnings left.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT } from './support.mjs';

const SKILL = join(ROOT, '.agents', 'skills', 'prompt-plan');
const read = (path) => readFileSync(join(SKILL, path), 'utf8');
const rules = (text) => text.split('\n').filter((line) => line.startsWith('- '));
const carries = (text, ...patterns) => rules(text).some((line) => patterns.every((pattern) => pattern.test(line)));

test('the triage reference is linked from SKILL.md and runs before the delivery report and the closing report, by a reviewer that did not write the plan', () => {
  const triage = read('references/warning-triage.md');
  assert.match(read('SKILL.md'), /\]\(references\/warning-triage\.md\)/);
  assert.ok(carries(triage, /before presenting the report that delivers a plan/, /before the closing report of an execution/));
  assert.ok(carries(triage, /subagent that did not write the plan/, /subagent mechanism of the prompt skill/, /separate pass of the coordinator/));
  assert.ok(carries(triage, /prove that each ⚠️ blocks/, /reads the line, its fragment, and its evidence/, /one sentence/));
  assert.ok(carries(triage, /`review\/report\.md`/, /next to the line|cites/));
  assert.ok(carries(triage, /in doubt/i, /blocks/));
  assert.ok(carries(triage, /never makes a check more permissive/, /never changes a criterion/, /authorizes[^.]*user/));
});

test('a warning that only defers a measurement a fragment runs is reported as ℹ️ with where it is measured, and the report asks to execute', () => {
  const triage = read('references/warning-triage.md');
  assert.ok(carries(triage, /not blocking/i, /measurement is only deferred/, /fragment of the plan runs it/, /names the fragment and its check line/));
  assert.ok(carries(triage, /risk existed before the change/, /does not touch/, /outside the scope/));
  assert.ok(carries(triage, /reported as ℹ️/, /classification/, /where it will be measured/, /not as ⚠️/));
  assert.ok(carries(triage, /dry run cannot run/, /fragment measures/, /ℹ️ from the start/));
  const ask = rules(read('SKILL.md')).find((line) => /after the triage/.test(line) && /asking the user whether to execute the plan now/.test(line)) ?? '';
  assert.match(ask, /no ❌, no ⚠️ that blocks, no 🚫/);
  assert.match(ask, /open decision, a pending datum, or a question/);
  assert.match(ask, /executing it as the recommended option/);
});

test('a ⚠️ that blocks leaves the report without the question to execute and with the reason it blocks', () => {
  const ask = rules(read('SKILL.md')).find((line) => /⚠️ that blocks/.test(line) && /ask nothing/.test(line)) ?? '';
  assert.match(ask, /say[^.]*why (?:it|each|they) blocks?/i);
  assert.match(ask, /execute only when the user asks in a later message/);
  assert.ok(carries(read('references/warning-triage.md'), /warning that blocks/, /stays ⚠️/, /says why it blocks/));
});

test('the request to execute that came with the plan still gets the one question, which is the request', () => {
  assert.ok(carries(read('SKILL.md'), /asked for with the request for this skill/, /no line blocks/, /one question/, /never an execution/, /choosing to execute/));
  assert.ok(carries(read('SKILL.md'), /Execute no fragment/, /until the user asks in a message after the report/));
});

test('what does not block is always ℹ️, and the risks of the delivered work among it close an execution in one ⏳ line with one question, and each blocking ⚠️ keeps its own', () => {
  const execution = read('references/execution.md');
  const triage = read('references/warning-triage.md');
  assert.ok(carries(execution, /ℹ️ lines of the triage/, /risks of the delivered work/, /deferred measurements already run/, /outside the scope/, /one `⏳ \[P-NN\]` line/, /its own ID/, /one question/, /accept all/, /recommended/, /review one by one/));
  assert.ok(carries(execution, /review one by one/, /its own ⚠️ line/, /its own ID/, /its own question/));
  assert.ok(carries(execution, /warning that blocks/, /its own question/, /its own ID/));
  assert.ok(carries(execution, /one subject, one ID/i, /same subject/, /same ID/, /never reused for another subject/));
  assert.ok(carries(triage, /closing report/, /risk of the delivered work/, /one ⏳ line/, /execution\.md/));
  assert.doesNotMatch(`${execution}\n${triage}`, /one question with one ID|warnings that do not block and still need acceptance/);
});

test('an answered entry carries [answered date ID], which closes nothing without the receipt of the hook, and no rule refuses it for lack of provenance', () => {
  const both = `${read('SKILL.md')}\n${read('references/execution.md')}`;
  assert.ok(carries(read('SKILL.md'), /\[answered YYYY-MM-DD P-01\]/, /receipt/, /never closes an entry by itself/));
  assert.ok(carries(read('references/execution.md'), /\[answered YYYY-MM-DD P-01\]/, /receipt/, /stays open/));
  assert.ok(carries(read('references/execution.md'), /ID at the start of the text of each question/));
  assert.ok(carries(read('references/execution.md'), /triage its ⚠️ lines/, /\]\(warning-triage\.md\)/));
  assert.doesNotMatch(both, /verified client path|cannot verify the origin|Mark an acceptance only/);
  assert.doesNotMatch(read('SKILL.md'), /accepted by the user/);
});
