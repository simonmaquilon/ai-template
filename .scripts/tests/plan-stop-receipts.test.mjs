import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { DONE, answer, answered, planRepo } from './plan-stop-fixture.mjs';

const stop = (fixture, input = {}) => answer(assert, fixture.fire('Stop', input));
const question = '- [P-01] Should I use the staging environment or the local one?';
const path = 'review/report.md';
const marked = `⏳ [P-01] Which environment should be checked? ${answered()}\n`;
const stored = (fixture) => join(fixture.folder, '.cache', 'stop-guard', 'receipts.json');
const receipts = (fixture) => JSON.parse(readFileSync(stored(fixture), 'utf8'));
// The user's next message, after which the plan files are written again, as the agent's next turn does.
const reply = (fixture, prompt = 'The staging one.') => {
  fixture.fire('UserPromptSubmit', { prompt });
  fixture.plan({});
};

for (const client of ['claude', 'codex']) {
  test(`${client}: a line with the answered mark and the receipt of a final question followed by a user turn neither blocks nor is listed`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': DONE, [path]: marked });
    assert.deepEqual(stop(fixture, { last_assistant_message: question }), {});
    assert.equal(receipts(fixture)['P-01'].status, 'presented');
    reply(fixture);
    fixture.plan({ [path]: `${marked}⚠️ [P-02] Live verification is partial\n` });
    const result = stop(fixture, { last_assistant_message: 'Finished.' });
    assert.equal(result.decision, 'block');
    assert.match(result.reason, /report\.md:2: ⚠️ \[P-02\]/);
    assert.doesNotMatch(result.reason, /report\.md:1: /);
    assert.equal(receipts(fixture)['P-01'].status, 'answered');
    fixture.plan({ [path]: marked });
    assert.deepEqual(stop(fixture, { last_assistant_message: 'Finished.' }), {});
  });

  test(`${client}: BUG-0001 a mark without a receipt blocks, and the receipt of a final question with no later user turn does not close the line`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': DONE, [path]: marked });
    const unmarked = stop(fixture, { last_assistant_message: 'Finished.' });
    assert.equal(unmarked.decision, 'block');
    assert.match(unmarked.reason, /mark without a receipt/);
    assert.match(unmarked.reason, /report\.md:1: ⏳ \[P-01\]/);
    assert.deepEqual(stop(fixture, { last_assistant_message: question }), {}, 'the visible question lets the turn end');
    assert.equal(receipts(fixture)['P-01'].status, 'presented');
    assert.equal(stop(fixture, { last_assistant_message: 'Finished.' }).decision, 'block');
    assert.equal(receipts(fixture)['P-01'].status, 'presented');
  });

  test(`${client}: a continuation prompt is no answer, and the mark of another ID closes nothing`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': DONE, [path]: `⏳ [P-01] Which environment should be checked? ${answered('P-02')}\n` });
    stop(fixture, { last_assistant_message: question });
    const { reason } = stop(fixture, { last_assistant_message: 'Finished.' });
    fixture.fire('UserPromptSubmit', { prompt: reason });
    assert.equal(receipts(fixture)['P-01'].status, 'presented');
    reply(fixture);
    assert.equal(receipts(fixture)['P-01'].status, 'answered');
    assert.equal(stop(fixture, { last_assistant_message: 'Finished.' }).decision, 'block');
  });

  test(`${client}: open lines that share an ID count once and are listed once, with how many more repeat it`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': DONE, [path]: '⏳ [P-01] Which timeout should we use?\n⚠️ [P-01] Baseline unavailable\n- 🚫 [P-01] Live run not verified\n⚠️ [P-02] Another subject\n' });
    const { reason } = stop(fixture, { last_assistant_message: 'Finished.' });
    assert.match(reason, /report\.md:1: ⏳ \[P-01\].*\(and 2 more open lines repeat P-01\)/);
    assert.doesNotMatch(reason, /report\.md:[23]: /);
    assert.match(reason, /report\.md:4: ⚠️ \[P-02\]/);
    const asked = '- [P-01] Should the timeout be 30 seconds or a minute?\n- [P-02] Should the baseline be measured now or later?';
    assert.match(stop(fixture, { last_assistant_message: asked }).reason, /report\.md:1: ⏳ \[P-01\]/, 'a shared ID is not one question');
  });

  test(`${client}: the receipt of the question tool with an answer closes the line, and one without an answer or without the ID closes nothing`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': DONE, [path]: marked });
    const text = '[P-01] Which environment should be checked?';
    const tool = (tool_input, tool_response) => fixture.fire('PostToolUse', { tool_name: 'AskUserQuestion', tool_input, tool_response });
    if (client === 'codex') {
      assert.throws(() => tool({}, {}), /codex has no PostToolUse hook for check-plan-stop\.mjs/);
      return;
    }
    const asking = (asked) => ({ questions: [{ question: asked, options: [] }] });
    for (const [asked, response] of [[text, { answers: {} }], [text, { answers: { [text]: '' } }], [text, { answers: { other: 'Staging' } }],
      ['Which environment should be checked?', { answers: { 'Which environment should be checked?': 'Staging' } }]]) {
      const result = tool(asking(asked), response);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(existsSync(stored(fixture)), false);
    }
    const result = tool(asking(text), { answers: { [text]: 'Staging' } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), '');
    assert.equal(receipts(fixture)['P-01'].status, 'answered');
    assert.deepEqual(stop(fixture, { last_assistant_message: 'Finished.' }), {});
  });

  test(`${client}: a question qualified with another plan folder gets no receipt in this plan`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': DONE, [path]: marked });
    stop(fixture, { last_assistant_message: '- [P-01] [2026-11-16-other] Should I use the staging environment or the local one?' });
    assert.equal(existsSync(stored(fixture)), false);
  });
}

test('claude: the question tool receipt also reads the answers from the input and from a text response, and names the plan it qualifies', (t) => {
  const fixture = planRepo(t, 'claude');
  fixture.plan({ 'build/00-index.md': DONE, [path]: marked });
  fixture.plan({ 'build/00-index.md': DONE, [path]: marked }, '2026-11-16-other');
  const text = '[P-01] [2026-11-16-other] Which environment should be checked?';
  const tool = (tool_input, tool_response) => fixture.fire('PostToolUse', { tool_name: 'AskUserQuestion', tool_input, tool_response });
  const other = join(fixture.repo.dir, '.temp', 'plans', '2026-11-16-other', '.cache', 'stop-guard', 'receipts.json');
  assert.equal(tool({ questions: [{ question: text }] }, { answers: {} }).status, 0);
  assert.equal(existsSync(other), false);
  assert.equal(tool({ questions: [{ question: text }], answers: { [text]: 'Staging' } }, {}).status, 0);
  assert.equal(JSON.parse(readFileSync(other, 'utf8'))['P-01'].status, 'answered');
  assert.equal(existsSync(stored(fixture)), false);
  const plain = '[P-02] Which timeout?';
  assert.equal(tool({ questions: [{ question: plain }] }, { answers: { [plain]: '30 seconds' } }).status, 0);
  assert.equal(existsSync(stored(fixture)), false, 'two plans make an unqualified question ambiguous');
});

test('claude: a text response that holds the answer of the question counts as an answer', (t) => {
  const fixture = planRepo(t, 'claude');
  fixture.plan({ 'build/00-index.md': DONE, [path]: marked });
  const text = '[P-01] Which environment should be checked?';
  const tool = (tool_response) => fixture.fire('PostToolUse', { tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: text }] }, tool_response });
  assert.equal(tool(`User has answered your questions: "${text}"="".`).status, 0);
  assert.equal(existsSync(stored(fixture)), false);
  assert.equal(tool(`User has answered your questions: "${text}"="Staging".`).status, 0);
  assert.equal(receipts(fixture)['P-01'].status, 'answered');
});
