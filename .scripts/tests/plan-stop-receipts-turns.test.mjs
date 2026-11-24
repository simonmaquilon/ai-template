import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { isAutomatic } from '../turn-marker.mjs';
import { DONE, answer, answered, planRepo } from './plan-stop-fixture.mjs';

const stop = (fixture, input = {}) => answer(assert, fixture.fire('Stop', input));
const question = '- [P-01] Should I use the staging environment or the local one?';
const path = 'review/report.md';
const marked = `⏳ [P-01] Which environment should be checked? ${answered()}\n`;
const stored = (fixture, plan = fixture.folder) => join(plan, '.cache', 'stop-guard', 'receipts.json');
const status = (fixture, id = 'P-01') => JSON.parse(readFileSync(stored(fixture), 'utf8'))[id]?.status;
const turn = (fixture, prompt) => {
  fixture.fire('UserPromptSubmit', { prompt });
  fixture.plan({});
};

test('isAutomatic recognises the machine wrappers a client delivers as a prompt, after spaces, and no prompt of a person', () => {
  for (const prompt of ['<task-notification>\n<task-id>b1</task-id>', '  \n<system-reminder>x</system-reminder>', '<agent-message from="a">', '<cross-session-message>', '<side-sessions-event>',
    '<ci-monitor-event>', '<webhook-payload>{}', '<wake reason="external-event">', '<child-session-event>', '[SYSTEM NOTIFICATION - NOT USER INPUT]', 'Another Claude session sent a message',
    '[Artifact comment sent to Claude]']) assert.equal(isAutomatic(prompt), true, prompt);
  for (const prompt of ['The staging one.', 'I read the <task-notification> and accept', 'accept [P-01]', '', undefined, 42]) assert.equal(isAutomatic(prompt), false, String(prompt));
});

for (const client of ['claude', 'codex']) {
  test(`${client}: an automatic turn leaves the receipt presented and the marked line blocking, and a person's prompt answers it`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': DONE, [path]: marked });
    assert.deepEqual(stop(fixture, { last_assistant_message: question }), {});
    for (const prompt of ['<task-notification>\n<summary>Background command done</summary>', '[SYSTEM NOTIFICATION - NOT USER INPUT]\nThe subagent reported.']) {
      turn(fixture, prompt);
      assert.equal(status(fixture), 'presented', prompt);
      assert.equal(stop(fixture, { last_assistant_message: 'Finished.' }).decision, 'block');
    }
    turn(fixture, 'The staging one.');
    assert.equal(status(fixture), 'answered');
    assert.deepEqual(stop(fixture, { last_assistant_message: 'Finished.' }), {});
  });

  test(`${client}: a mark whose line has no ID of its own closes nothing, even with the receipt of the ID the mark names`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': DONE, [path]: marked });
    stop(fixture, { last_assistant_message: question });
    turn(fixture, 'The staging one.');
    fixture.plan({ [path]: `⚠️ Risk X ${answered()}\n` });
    const { reason } = stop(fixture, { last_assistant_message: 'Finished.' });
    assert.match(reason, /report\.md:1: ⚠️ Risk X/);
  });

  test(`${client}: a question asked again returns its answered receipt to presented, and the marked line blocks until the user answers`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': DONE, [path]: marked });
    stop(fixture, { last_assistant_message: question });
    turn(fixture, 'The staging one.');
    assert.equal(status(fixture), 'answered');
    assert.deepEqual(stop(fixture, { last_assistant_message: question }), {});
    assert.equal(status(fixture), 'presented');
    assert.equal(stop(fixture, { last_assistant_message: 'Finished.' }).decision, 'block');
    turn(fixture, 'Still the staging one.');
    assert.deepEqual(stop(fixture, { last_assistant_message: 'Finished.' }), {});
  });

  test(`${client}: a Stop that blocks for the plan records no receipt, and one that lets it through does`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': DONE, [path]: `${marked}⚠️ [P-02] Live verification is partial\n` });
    assert.equal(stop(fixture, { last_assistant_message: question }).decision, 'block');
    assert.equal(existsSync(stored(fixture)), false);
    fixture.plan({ [path]: marked });
    assert.deepEqual(stop(fixture, { last_assistant_message: question }), {});
    assert.equal(status(fixture), 'presented');
  });

  test(`${client}: ℹ️ lines open nothing, and the one ⏳ line that asks to accept them closes with its question, or with its mark and receipt`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    const risks = 'ℹ️ Risk A, delivered work, classified as not blocking\nℹ️ Risk B, delivered work, classified as not blocking\n';
    fixture.plan({ 'build/00-index.md': DONE, [path]: `${risks}⏳ [P-05] Accept risks A and B ${answered('P-05')}\n` });
    const ask = '- [P-05] Do you accept all the listed risks or review them one by one?';
    assert.equal(stop(fixture, { last_assistant_message: 'Finished.' }).decision, 'block');
    assert.deepEqual(stop(fixture, { last_assistant_message: ask }), {});
    turn(fixture, 'Accept all.');
    const result = stop(fixture, { last_assistant_message: 'Finished.' });
    assert.deepEqual(result, {});
    assert.equal(status(fixture, 'P-05'), 'answered');
  });
}

test('claude: the question tool gives a receipt only to the plans the turn touched, and none when two are touched and the question names neither', (t) => {
  const fixture = planRepo(t, 'claude');
  const other = '2026-11-16-other';
  fixture.plan({ 'build/00-index.md': DONE, [path]: marked }, other);
  fixture.old();
  fixture.turn();
  fixture.plan({ 'build/00-index.md': DONE, [path]: marked });
  const text = '[P-01] Which environment should be checked?';
  const tool = (asked) => fixture.fire('PostToolUse', { tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: asked }] }, tool_response: { answers: { [asked]: 'Staging' } } });
  assert.equal(tool(text).status, 0);
  assert.equal(status(fixture), 'answered');
  assert.equal(existsSync(stored(fixture, join(fixture.repo.dir, '.temp', 'plans', other))), false);
  fixture.plan({ 'build/00-index.md': DONE, [path]: marked }, other);
  assert.equal(tool('[P-02] Which timeout?').status, 0);
  assert.equal(status(fixture, 'P-02'), undefined);
});
