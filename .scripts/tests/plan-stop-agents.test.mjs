import assert from 'node:assert/strict';
import { existsSync, readdirSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { answer, index, planRepo } from './plan-stop-fixture.mjs';

const input = (id) => ({ agent_id: id, agent_type: 'general-purpose', stop_hook_active: false });
const guards = (fixture, plan = fixture.folder) => (existsSync(join(plan, '.cache', 'stop-guard')) ? readdirSync(join(plan, '.cache', 'stop-guard')) : []);

for (const client of ['claude', 'codex']) {
  test(`${client}: a subagent keeps state only in plans in execution and drops it when it ends`, (t) => {
    const fixture = planRepo(t, client);
    fixture.plan({ 'build/00-index.md': index('done', 'pending') }, '2026-11-01-old');
    fixture.plan({ 'review/times.log': '2026-11-16T10:00:00Z\t02\tStep\n2026-11-16T10:01:00Z\twait\tEnd\n' }, '2026-11-01-old');
    fixture.old();
    fixture.turn();
    fixture.plan({ 'build/00-index.md': index('done', 'pending'), 'review/report.md': '⏳ Fragment 02 still to run\n' });
    fixture.agent('agent-1');
    assert.deepEqual(guards(fixture), [`agent-session-${client}--agent-1.json`]);
    assert.deepEqual(guards(fixture, join(fixture.repo.dir, '.temp', 'plans', '2026-11-01-old')), []);
    fixture.plan({ 'review/report.md': '⏳ Fragment 02 still to run\n✅ AC1 checked again (01)\n' });
    assert.deepEqual(answer(assert, fixture.fire('SubagentStop', input('agent-1'))), {});
    assert.deepEqual(guards(fixture), []);
  });

  test(`${client}: a subagent answers for no before record the session opened before delegating`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': index('done', 'pending'), 'patch/02.before': 'tree\n', 'review/report.md': '✅ AC1 met\n' });
    fixture.old();
    fixture.agent('agent-1');
    fixture.plan({ 'review/report.md': '✅ AC1 met\n✅ AC2 part one met (02)\n' });
    assert.deepEqual(answer(assert, fixture.fire('SubagentStop', input('agent-1'))), {});
    // The session's own stop still holds the fragment left open.
    assert.match(answer(assert, fixture.fire('Stop', { stop_hook_active: false })).reason, /fragments pending, with none failed or blocked, that no marked ⏳ line names: 02/);
  });

  test(`${client}: of two subagents, only the one that opened a before record answers for it`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': index('done', 'pending', 'pending') });
    fixture.old();
    fixture.agent('first');
    fixture.agent('second');
    const markers = join(fixture.repo.dir, '.temp', 'check-plan-stop');
    const back = (name, seconds) => utimesSync(join(markers, name), new Date(Date.now() - seconds * 1000), new Date(Date.now() - seconds * 1000));
    back(`session-${client}--first`, 90);
    back(`session-${client}--second`, 30);
    fixture.plan({ 'patch/03.before': 'tree\n' });
    assert.deepEqual(answer(assert, fixture.fire('SubagentStop', input('first'))), {}, 'the earlier subagent did not open it');
    assert.match(answer(assert, fixture.fire('SubagentStop', input('second'))).reason, /fragment 03 \(pending\), whose before record this subagent opened/);
  });

  test(`${client}: a subagent in a plan without patch/ answers for the report lines it wrote`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': index('done', 'pending'), 'review/report.md': '⏳ Fragment 02 still to run\n' });
    fixture.agent('agent-1');
    fixture.plan({ 'review/report.md': '⏳ Fragment 02 still to run\n⚠️ AC2 not measured (02)\n' });
    const blocked = answer(assert, fixture.fire('SubagentStop', input('agent-1')));
    assert.match(blocked.reason, /report\.md:2: ⚠️ AC2 not measured/);
    assert.doesNotMatch(blocked.reason, /still to run|whose before record/);
  });
}
