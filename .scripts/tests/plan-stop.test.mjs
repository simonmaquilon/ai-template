import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCEPTED, ASKED, DONE, answer, index, planRepo } from './plan-stop-fixture.mjs';

const stop = (fixture, input = {}) => answer(assert, fixture.fire('Stop', { stop_hook_active: false, ...input }));

for (const client of ['claude', 'codex']) {
  test(`${client}: the plan-stop hook stays silent without a plan in execution this turn`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    assert.deepEqual(stop(fixture), {});
    // A plan delivered this turn but never executed has no times.log.
    fixture.plan({ 'review/times.log': null, 'build/00-index.md': index('pending'), 'review/report.md': '⏳ AC1 pending (01)\n' });
    assert.deepEqual(stop(fixture), {});
    // An execution from an earlier turn that nothing wrote this turn.
    fixture.plan({});
    fixture.old();
    assert.deepEqual(stop(fixture), {});
  });

  test(`${client}: the plan-stop hook blocks open report lines until resolved or asked in the final message`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': DONE, 'review/report.md': 'Yes, it is done.\n\n- ✅ AC1 met (01)\n- ℹ️ note\n' });
    assert.deepEqual(stop(fixture), {});
    fixture.plan({ 'review/report.md': '✅ AC1 met\n⚠️ AC2 not measured (01)\n⏳ Commit waits on an authorization\n' });
    const blocked = stop(fixture);
    assert.equal(blocked.decision, 'block');
    assert.match(blocked.reason, /execution\.md, Ending an execution/);
    assert.match(blocked.reason, /review\/report\.md:2: ⚠️ AC2 not measured/);
    assert.match(blocked.reason, /review\/report\.md:3: ⏳ Commit waits/);
    assert.doesNotMatch(blocked.reason, /:1: /);
    assert.match(blocked.reason, /within what the user authorized/);
    assert.match(blocked.reason, /specific question on its own final-message line/);
    fixture.plan({ 'review/report.md': `✅ AC1 met\n⚠️ [P-01] AC2 not measured ${ACCEPTED}\n⏳ [P-02] Commit waits on an authorization ${ASKED}\n` });
    assert.equal(stop(fixture).decision, 'block');
    const last_assistant_message = '- [P-01] Should I rerun the AC2 measurement?\n- [P-02] Do you authorize the commit?';
    assert.deepEqual(stop(fixture, { last_assistant_message }), {});
    fixture.plan({ 'review/report.md': '⚠️ AC2 [asked the user someday]\n' });
    assert.equal(stop(fixture).decision, 'block');
  });

  test(`${client}: the plan-stop hook requires a final question for each fragment awaiting a decision`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': index('done', 'pending', '`pending`'), 'review/report.md': '✅ AC1 met\n' });
    assert.match(stop(fixture).reason, /fragments pending and missing a final question: 02, 03/);
    // The user asked to run only fragment 01; the date of a mark and the identifier each name no fragment.
    fixture.plan({ 'review/report.md': '✅ AC1 met\n⏳ [P-03] Fragment 02 waits until the user asks to run it [accepted by the user 2026-01-03]\n' });
    const stopWithQuestion = () => stop(fixture, { last_assistant_message: '- [P-03] Should I run the remaining fragments?' });
    assert.match(stopWithQuestion().reason, /fragments pending and missing a final question: 03\n/);
    fixture.plan({ 'review/report.md': `✅ AC1 met\n⏳ [P-03] Fragments 02 and 03 wait until the user asks to run them ${ACCEPTED}\n` });
    assert.deepEqual(stopWithQuestion(), {});
    fixture.plan({ 'build/00-index.md': index('done', 'failed', 'pending'), 'review/report.md': '✅ AC1 met\n' });
    const failed = stop(fixture);
    assert.match(failed.reason, /fragment 02 is failed and missing a final question/);
    assert.doesNotMatch(failed.reason, /fragments pending/);
    fixture.plan({ 'review/report.md': `❌ AC2 failed (02)\n⏳ [P-03] Fragment 02 waits on how to go on ${ASKED}\n` });
    assert.deepEqual(stopWithQuestion(), {});
    fixture.plan({ 'build/00-index.md': index('done', 'blocked', 'blocked') });
    assert.match(stop(fixture).reason, /fragment 03 is blocked and missing a final question/);
  });

  test(`${client}: a subagent answers only for the fragments it opened and never for report lines`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': index('done', 'pending', 'pending'), 'review/report.md': '⏳ Fragments 02 and 03 still to run\n' });
    const input = { agent_id: 'agent-1', agent_type: 'general-purpose', stop_hook_active: false };
    assert.deepEqual(answer(assert, fixture.fire('SubagentStop', input)), {}, 'no start marker');
    fixture.agent('agent-1');
    assert.deepEqual(answer(assert, fixture.fire('SubagentStop', input)), {}, 'a subagent that did no plan work');
    // Each later run starts again, as a subagent the session launches or resumes does.
    fixture.agent('agent-1');
    // The session delegated fragment 02, which the subagent ran and recorded: 03 and the inherited line stay the session's.
    fixture.plan({ 'build/00-index.md': index('done', 'done', 'pending'), 'review/report.md': '✅ AC2 met (02)\n⏳ Fragments 02 and 03 still to run\n' });
    assert.deepEqual(answer(assert, fixture.fire('SubagentStop', input)), {});
    fixture.agent('agent-1');
    fixture.plan({ 'patch/03.before': 'tree\n', 'review/report.md': '✅ AC2 met (02)\n⏳ Fragments 02 and 03 still to run\n⚠️ AC3 not measured (03)\n' });
    const blocked = answer(assert, fixture.fire('SubagentStop', input));
    assert.match(blocked.reason, /fragment 03 \(pending\), whose before record this subagent opened, is not done/);
    assert.doesNotMatch(blocked.reason, /report\.md|still to run/);
    assert.match(blocked.reason, /Hand each unresolved decision to the coordinator in your final message/);
    if (client === 'claude') {
      const background = [{ id: 'task-1', type: 'subagent', status: 'running', agent_type: 'general-purpose' }];
      assert.deepEqual(stop(fixture, { background_tasks: background }), {});
      const shell = [{ id: 'task-2', type: 'shell', status: 'running', command: 'tail -f log' }];
      assert.equal(stop(fixture, { background_tasks: shell }).decision, 'block');
    }
  });
}
