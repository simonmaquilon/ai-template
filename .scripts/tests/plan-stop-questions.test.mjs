import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ACCEPTED, ASKED, DONE, answer, index, planRepo } from './plan-stop-fixture.mjs';

const stop = (fixture, input = {}) => answer(assert, fixture.fire('Stop', input));
const question = '- [P-01] Should I run fragment 02 now or leave it pending?';
const path = 'review/report.md';

for (const client of ['claude', 'codex']) {
  test(`${client}: BUG-0001 report marks and tool output never establish acceptance`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': index('done', 'pending'), [path]: `⏳ [P-01] Fragment 02 remains pending ${ASKED}\n⚠️ [P-02] Live verification is partial ${ACCEPTED}\n` });
    fixture.fire('UserPromptSubmit', { prompt: 'I accept [P-01] and [P-02].' });
    fixture.plan({});
    const result = stop(fixture, { tool_response: { answers: { 'P-01': 'Accept', 'P-02': 'Accept' } }, decision: 'accept' });
    assert.equal(result.decision, 'block');
    assert.match(result.reason, /approval provenance/i);
    assert.match(result.reason, /fragments pending.*02/);
    assert.match(result.reason, /report\.md:1: ⏳ \[P-01\]/);
    assert.match(result.reason, /report\.md:2: ⚠️ \[P-02\]/);
  });

  test(`${client}: only matched questions in the final reply pause open items`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    const pending = '⏳ [P-01] Fragment 02 remains pending\n';
    fixture.plan({ 'build/00-index.md': index('done', 'pending'), [path]: pending });
    for (const last_assistant_message of [question.replace('P-01', 'P-02'), '- [P-01] The user accepted the remaining work.', `\`\`\`md\n${question}\n\`\`\``]) {
      assert.equal(stop(fixture, { last_assistant_message }).decision, 'block');
    }
    assert.deepEqual(stop(fixture, { last_assistant_message: question }), {});
    assert.equal(readFileSync(join(fixture.folder, path), 'utf8'), pending);
    assert.equal(stop(fixture, { last_assistant_message: 'Finished.' }).decision, 'block');
  });

  test(`${client}: unqualified final questions cannot satisfy multiple simultaneous plans with reused IDs`, (t) => {
    const name = '2026-11-16-a-first';
    const fixture = planRepo(t, client, name);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': DONE, [path]: '⏳ [P-01] Awaiting the first decision\n' });
    fixture.plan({ 'build/00-index.md': DONE, [path]: '⚠️ [P-01] Awaiting the second decision\n' }, '2026-11-16-b-second');
    const unqualified = stop(fixture, { last_assistant_message: question });
    assert.match(unqualified.reason, /a-first/);
    assert.match(unqualified.reason, /b-second/);
    const qualified = stop(fixture, { last_assistant_message: question.replace('[P-01]', `[P-01] [${name}]`) });
    assert.doesNotMatch(qualified.reason, /a-first/);
    assert.match(qualified.reason, /b-second/);
  });

  test(`${client}: tagged partial evidence remains open pending a visible question`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    const partial = `⏳ [partial] [P-01] Parcial. The sandbox check passed; the live run is pending ${ACCEPTED}\n`;
    fixture.plan({ 'build/00-index.md': DONE, [path]: partial });
    assert.equal(stop(fixture, { last_assistant_message: `<!--\n${question}\n-->` }).decision, 'block');
    assert.deepEqual(stop(fixture, { last_assistant_message: '- [P-01] Do you authorize the live run?' }), {});
    assert.equal(readFileSync(join(fixture.folder, path), 'utf8'), partial);
  });

  test(`${client}: duplicate report IDs cannot put two distinct items to the user`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': DONE, [path]: '⏳ [P-01] Which timeout should we use?\n⚠️ [P-01] Baseline unavailable\n' });
    const result = stop(fixture, { last_assistant_message: '- [P-01] Should the timeout be 30 seconds or a minute?' });
    assert.match(result.reason, /report\.md:1: ⏳ \[P-01\]/);
    assert.match(result.reason, /report\.md:2: ⚠️ \[P-01\]/);
  });

  test(`${client}: a subagent's final handoff defers only its own obligations`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': index('done', 'pending', 'pending'), [path]: '⏳ [P-01] Fragment 03 stays with the coordinator\n' });
    fixture.agent('agent-1');
    fixture.plan({ 'patch/02.before': 'tree\n', [path]: `⏳ [P-01] Fragment 03 stays with the coordinator\n⚠️ [P-02] Fragment 02 has a gap ${ASKED}\n` });
    const handoff = (last_assistant_message) => answer(assert, fixture.fire('SubagentStop', { agent_id: 'agent-1', last_assistant_message }));
    const reportLine = '- Handoff [P-02] Should the coordinator rerun the deferred live verification?';
    const fragmentLine = '- Handoff fragment 02 Should the coordinator retry fragment 02 or leave it pending?';
    const incomplete = handoff(reportLine);
    assert.match(incomplete.reason, /fragment 02 \(pending\)/);
    assert.doesNotMatch(incomplete.reason, /report\.md:2:/);
    assert.equal(handoff(`- Handoff [P-03] Should we retry live verification?\n${fragmentLine}`).decision, 'block');
    assert.deepEqual(handoff(`${reportLine}\n${fragmentLine}`), {});
    const coordinator = stop(fixture, { last_assistant_message: `${reportLine}\n${fragmentLine}` });
    assert.match(coordinator.reason, /pending.*02, 03/);
    assert.match(coordinator.reason, /report\.md:2: ⚠️ \[P-02\]/);
  });
}
