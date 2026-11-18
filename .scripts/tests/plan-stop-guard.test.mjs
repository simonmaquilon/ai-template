import assert from 'node:assert/strict';
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { DONE, answer, index, planRepo } from './plan-stop-fixture.mjs';
import { WINDOWS } from './support.mjs';

// Every stop passes stop_hook_active false, as a client whose continuation reads as a new turn would: the count alone
// must bound the continuations.
const stop = (fixture, input = {}) => answer(assert, fixture.fire('Stop', { stop_hook_active: false, ...input }));

for (const client of ['claude', 'codex']) {
  test(`${client}: the plan-stop hook lets a stop through after three blocks with the same open items`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': DONE, 'review/report.md': '⏳ Push waits on an authorization\n' });
    assert.match(stop(fixture).reason, /continuation 1 of at most 20 in 30 minutes:/);
    // A line that only moves is no progress.
    fixture.plan({ 'review/report.md': '\n⏳ Push waits on an authorization\n' });
    assert.match(stop(fixture).reason, /continuation 2 of at most 20 in 30 minutes:/);
    const last = stop(fixture);
    assert.match(last.reason, /continuation 3 of at most 20 in 30 minutes, the last one this hook forces:/);
    assert.match(last.reason, /The next stop with these same open items goes through with an open-items warning/);
    const released = stop(fixture);
    assert.equal(released.decision, undefined);
    assert.match(released.systemMessage, /still has 1 open item\. The turn may end because the continuation limit was reached: review\/report\.md:2: ⏳ Push/);
    assert.deepEqual(stop(fixture), {}, 'the same turn stays released');
    fixture.old();
    fixture.turn();
    assert.deepEqual(stop(fixture), {}, 'a later turn that writes nothing in the plan');
    fixture.plan({ 'review/report.md': '⏳ Push waits on an authorization\n' });
    assert.match(stop(fixture).reason, /continuation 4 of at most 20/, 'a later turn that writes the plan blocks again, within the same window');
  });

  test(`${client}: progress restarts the run of blocks, and a cap per window ends any of them`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    for (let n = 1; n <= 20; n++) {
      fixture.plan({ 'build/00-index.md': DONE, 'review/report.md': `⏳ item ${n}\n` });
      assert.match(stop(fixture).reason, new RegExp(`continuation ${n} of at most 20 in 30 minutes${n === 20 ? ', the last one[^]*The next stop goes through' : ':'}`));
    }
    fixture.plan({ 'review/report.md': '⏳ item 21\n' });
    assert.ok(stop(fixture).systemMessage);
  });

  test(`${client}: a counter left by another turn is never read`, (t) => {
    const fixture = planRepo(t, client);
    fixture.plan({ 'build/00-index.md': DONE, 'review/report.md': '⏳ Push waits on an authorization\n' });
    const state = join(fixture.folder, '.cache', 'stop-guard', `session-session-${client}.json`);
    mkdirSync(join(fixture.folder, '.cache', 'stop-guard'), { recursive: true });
    writeFileSync(state, JSON.stringify({ turn: 1, fingerprint: 'x', stale: 1, blocks: 1 }));
    fixture.old();
    fixture.turn();
    assert.deepEqual(stop(fixture), {}, 'an interrupted chain does not make an untouched plan count');
    writeFileSync(state, JSON.stringify({ turn: 1, released: true }));
    fixture.plan({});
    assert.match(stop(fixture).reason, /continuation 1 of at most 20 in 30 minutes:/, 'an old release does not let this turn through');
  });

  test(`${client}: the plan-stop hook never holds a stop on its own trouble`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    assert.equal(fixture.fire('Stop', null).status, 0, 'a null input');
    assert.equal(fixture.fire('Stop', null).stdout, '');
    fixture.plan({ 'build/00-index.md': DONE });
    assert.deepEqual(stop(fixture), {}, 'no report, every fragment done');
    // A plan that cannot be read does not keep the others from being checked.
    fixture.plan({ 'build/00-index.md': index('pending') }, '2026-11-16-other');
    writeFileSync(join(fixture.repo.dir, '.temp', 'plans', '0-broken'), '');
    mkdirSync(join(fixture.repo.dir, '.temp', 'plans', '1-broken'));
    writeFileSync(join(fixture.repo.dir, '.temp', 'plans', '1-broken', 'review'), 'not a folder\n');
    const isolated = stop(fixture);
    assert.match(isolated.reason, /2026-11-16-other, continuation 1 of at most 20 in 30 minutes:/);
    // Windows reports a file used as a folder as a missing path, so that plan just counts as not started there.
    if (process.platform !== 'win32') assert.match(isolated.systemMessage, /\.temp\/plans\/1-broken could not be checked/);
    mkdirSync(join(fixture.folder, 'review', 'report.md'), { recursive: true });
    const unreadable = stop(fixture);
    assert.match(unreadable.reason, /2026-11-16-other, continuation 2 of at most 20 in 30 minutes:/);
    assert.doesNotMatch(unreadable.reason, /2026-11-16-change/);
    assert.match(unreadable.systemMessage, /2026-11-16-change: could not read review\/report\.md, so its execution was not checked/);
    const broken = planRepo(t, client);
    broken.turn();
    writeFileSync(join(broken.repo.dir, '.temp', 'plans'), 'not a folder\n');
    const failure = stop(broken);
    assert.equal(failure.decision, undefined);
    assert.match(failure.systemMessage, /could not be checked .*so the stop goes through/);
  });

  test(`${client}: a stop goes through whenever the counter cannot be kept`, { skip: WINDOWS && 'symlinks need privileges on Windows' }, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    fixture.plan({ 'build/00-index.md': DONE, 'review/report.md': '⏳ Push waits on an authorization\n' });
    mkdirSync(join(fixture.repo.dir, '.temp', 'elsewhere'));
    symlinkSync(join(fixture.repo.dir, '.temp', 'elsewhere'), join(fixture.folder, '.cache'));
    for (let n = 0; n < 4; n++) {
      const passed = stop(fixture);
      assert.equal(passed.decision, undefined);
      assert.match(passed.systemMessage, /The turn may end because the hook could not keep its count in the plan’s \.cache\//);
    }
    assert.equal(existsSync(join(fixture.repo.dir, '.temp', 'elsewhere', 'stop-guard')), false);
  });

  test(`${client}: the plan-stop hook reads plans whose paths hold spaces, from any folder of the project`, (t) => {
    const fixture = planRepo(t, client, '2026-11-16 my change');
    fixture.turn();
    fixture.plan({ 'build/00-index.md': index('done', 'pending') });
    const sub = join(fixture.repo.dir, 'sub dir', 'deeper');
    mkdirSync(sub, { recursive: true });
    assert.match(answer(assert, fixture.fire('Stop', { stop_hook_active: false }, sub)).reason, /\.temp\/plans\/2026-11-16 my change, continuation 1 of at most 20 in 30 minutes:/);
    assert.ok(existsSync(join(fixture.folder, '.cache', 'stop-guard', `session-session-${client}.json`)));
    // Ids the client sends are kept to letters, digits, _ and -, so no separator reaches a file name.
    fixture.fire('SubagentStart', { agent_id: 'a\\b/c:d', agent_type: 'x' }, sub);
    assert.ok(existsSync(join(fixture.repo.dir, '.temp', 'check-plan-stop', `session-${client}--a_b_c_d`)));
  });
}
