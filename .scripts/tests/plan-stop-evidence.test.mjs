import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { makePlan } from './prompt-plan-cache-plan.mjs';
import { DONE, answer, planRepo } from './plan-stop-fixture.mjs';
import { ROOT, hookFor, runClientHook } from './support.mjs';

const canonical = '.agents/skills/prompt-plan/scripts/node';

for (const client of ['claude', 'codex']) {
  test(`${client}: a current plan requires the checked-in evidence evaluator`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({
      'check/report.mjs': 'throw new Error("This plan file must never run from the hook.");\n',
      'build/00-index.md': DONE,
      'review/report.md': '✅ C passed [[run:final-run.json]]\n',
    });
    const stopped = answer(assert, fixture.fire('Stop'));
    assert.equal(stopped.decision, 'block');
    assert.match(stopped.reason, /could not load the checked-in evidence evaluator/i);
  });

  test(`${client}: the Stop hook requires fresh closure evidence without rewriting the report`, (t) => {
    const { repo, plan, all } = makePlan(t);
    mkdirSync(join(repo.dir, canonical), { recursive: true });
    for (const name of ['check-report.mjs', 'check-state.mjs']) cpSync(join(ROOT, canonical, name), join(repo.dir, canonical, name));
    mkdirSync(join(plan, 'build'));
    writeFileSync(join(plan, 'build', '03-close.md'), '# Close\n<!-- check: final -->\n');
    writeFileSync(join(plan, 'build', '00-index.md'), '| [03](03-close.md) | Close | C | | done |\n');
    const fire = (event, extra = {}) => answer(assert, runClientHook(client, hookFor(client, event, 'check-plan-stop.mjs'), repo, {
      input: { session_id: `evidence-${client}`, hook_event_name: event, ...extra },
    }));
    fire('UserPromptSubmit');
    const final = all(['--final']);
    assert.equal(final.status, 0, final.stderr + final.stdout);
    writeFileSync(join(plan, 'review', 'times.log'), '2026-11-16T10:00:00Z\t03\tClose\n');
    const report = '✅ C passed [[run:final-run.json]]\n';
    writeFileSync(join(plan, 'review', 'report.md'), report);
    assert.deepEqual(fire('Stop'), {});
    repo.write('kept.txt', 'changed after the final run\n');
    const stale = fire('Stop', { last_assistant_message: '- [P-01] Do you accept leaving the final check stale?' });
    assert.equal(stale.decision, 'block');
    assert.match(stale.reason, /needs fresh passing review\/final-run\.json/);
    assert.match(stale.reason, /cites missing, stale or mismatched run evidence/);
    assert.equal(readFileSync(join(plan, 'review', 'report.md'), 'utf8'), report);
  });
}
