import assert from 'node:assert/strict';
import test from 'node:test';
import { namedFragments } from '../plan-stop-questions.mjs';
import { ASKED, DONE, answer, index, planRepo } from './plan-stop-fixture.mjs';

const stop = (fixture, input = {}) => answer(assert, fixture.fire('Stop', { stop_hook_active: false, ...input }));

for (const client of ['claude', 'codex']) {
  test(`${client}: a questioned report line names fragments as words of their own, and ranges cover what lies between`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    const pending = (line) => {
      fixture.plan({ 'build/00-index.md': index('done', 'pending', 'pending', 'pending'), 'review/report.md': `⏳ [P-01] ${line} ${ASKED}\n` });
      return stop(fixture, { last_assistant_message: '- [P-01] Should I run the listed fragments now or wait?' })
        .reason?.match(/fragments pending and missing a final question: ([\d, ]+)/)?.[1] ?? '';
    };
    for (const line of ['Fragments 02 to 04 wait', 'Fragmentos 02 a 04 esperan', 'Fragments 02-04 wait', 'Fragments 02–04 wait', 'Fragments 02—04 wait', 'Fragments 02, 03 and 04 wait']) {
      assert.equal(pending(line), '', line);
    }
    assert.equal(pending('AC03 and fragment 02 wait'), '03, 04');
    assert.equal(pending('Fragment 02 waits since 2026-11-03 at 03:15'), '03, 04');
    assert.equal(pending('Fragments 0203 and 04 wait'), '02, 03');
    // Amounts, paths, and file names name no fragment.
    for (const line of ['⏳ Fragment 02 waits 10 min', '⏳ Fragment 02 covers 80% of 12 files', '⏳ Fragment 02 waits, see review/05-check-x.log and 04-check.log']) {
      assert.deepEqual([...namedFragments(line)], ['02'], line);
    }
  });

  test(`${client}: a plan waiting on the user stays out of the reason while another one still runs`, (t) => {
    const fixture = planRepo(t, client, '2026-11-16-a-waiting');
    fixture.turn();
    fixture.plan({
      'review/times.log': '2026-11-16T09:00:00Z\t02\tStep\n2026-11-16T09:30:00Z\twait\tDecision on fragment 02\n',
      'build/00-index.md': index('done', 'blocked'),
      'review/report.md': `⏳ [P-01] Fragment 02 waits on the user's choice of layout ${ASKED}\n`,
    });
    fixture.plan({ 'build/00-index.md': index('done', 'pending') }, '2026-11-16-b-running');
    const blocked = stop(fixture, { last_assistant_message: '- [P-01] [2026-11-16-a-waiting] Should fragment 02 use the compact or expanded layout?' });
    assert.match(blocked.reason, /2026-11-16-b-running, continuation 1 of at most 20 in 30 minutes:\n- build\/00-index\.md: fragments pending/);
    assert.doesNotMatch(blocked.reason, /a-waiting/);
  });

  test(`${client}: without a turn marker only a plan with a fragment open counts, and its count ends`, (t) => {
    const fixture = planRepo(t, client);
    fixture.plan({ 'build/00-index.md': index('pending') });
    fixture.old();
    const input = { session_id: '' };
    for (const n of [1, 2, 3]) assert.match(stop(fixture, input).reason, new RegExp(`continuation ${n} of`));
    assert.ok(stop(fixture, input).systemMessage, 'an old open segment is let through once its count ends');
    assert.deepEqual(stop(fixture, input), {});
    fixture.plan({ 'review/times.log': '2026-11-16T10:00:00Z\t01\tStep\n2026-11-16T10:05:00Z\twait\tQuestion to the user\n' });
    assert.deepEqual(stop(fixture, input), {});
    fixture.plan({ 'review/times.log': '2026-11-16T10:00:00Z\t01\tStep\n2026-11-16T10:05:00Z\twait\tQuestion\n2026-11-16T11:00:00Z\t01\tStep\n' });
    assert.match(stop(fixture, input).reason, /continuation 4 of/, 'a segment opened later blocks again, within the same window');
  });

  test(`${client}: a plan outside a marked turn remains active during coordination work`, (t) => {
    const fixture = planRepo(t, client);
    fixture.plan({
      'build/00-index.md': index('pending'),
      'review/times.log': '2026-11-16T10:00:00Z\twork\tCompare closure evidence\n',
    });
    const input = { session_id: '' };
    assert.match(stop(fixture, input).reason, /fragments pending and missing a final question: 01/);
    fixture.plan({ 'review/times.log': '2026-11-16T10:00:00Z\twork\tCompare closure evidence\n2026-11-16T10:05:00Z\tend\tEnd\n' });
    assert.deepEqual(stop(fixture, input), {});
  });

  test(`${client}: continuations end even when the client prefixes the reason or each one renews the turn`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    let passed = 0;
    for (let n = 1; n <= 30 && !passed; n++) {
      fixture.plan({ 'build/00-index.md': DONE, 'review/report.md': `⏳ Push waits on an authorization\n\n${'\n'.repeat(n % 2)}` });
      const result = stop(fixture);
      if (result.reason) fixture.fire('UserPromptSubmit', { prompt: `Another Stop hook asks to go on.\n${result.reason}` });
      else passed = n;
    }
    assert.equal(passed, 4, 'the token keeps the turn, so three blocks with the same items end it');
    const renewing = planRepo(t, client);
    renewing.turn();
    passed = 0;
    for (let n = 1; n <= 30 && !passed; n++) {
      renewing.plan({ 'build/00-index.md': DONE, 'review/report.md': '⏳ Push waits on an authorization\n' });
      const result = stop(renewing);
      if (result.reason) renewing.fire('UserPromptSubmit', { prompt: 'Continue.' });
      else passed = n;
    }
    assert.equal(passed, 21, 'a turn renewed each time is still bounded by the window');
  });
}
