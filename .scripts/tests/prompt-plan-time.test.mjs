// The time script that the prompt-plan skill copies into every plan as check/time.mjs: the lines it records in
// review/times.log and the table it prints from them, in a plan folder of a throwaway repository.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, makeRepo } from './support.mjs';

const BUNDLED = join(ROOT, '.agents', 'skills', 'prompt-plan', 'scripts', 'node');

// A plan with lib and time copied into check/ and one build file per fragment, each with the heading given.
function makePlan(t, headings = { '01-surface': '# 01 · Surface', '02-erase': '# 02: Erase procedure', '03-units': 'No heading' }) {
  const repo = makeRepo(t);
  const plan = join(repo.dir, '.temp', 'plans', 'p');
  for (const folder of ['build', 'check']) mkdirSync(join(plan, folder), { recursive: true });
  cpSync(join(BUNDLED, 'check-lib.mjs'), join(plan, 'check', 'lib.mjs'));
  cpSync(join(BUNDLED, 'check-time.mjs'), join(plan, 'check', 'time.mjs'));
  for (const [name, heading] of Object.entries(headings)) writeFileSync(join(plan, 'build', `${name}.md`), `${heading}\n\nBody.\n`);
  const log = join(plan, 'review', 'times.log');
  // TZ fixes the local time the table shows.
  const time = (...args) => spawnSync(process.execPath, [join(plan, 'check', 'time.mjs'), ...args], { cwd: repo.dir, encoding: 'utf8', env: { ...process.env, TZ: 'UTC' } });
  return { plan, log, time, read: () => (existsSync(log) ? readFileSync(log, 'utf8') : '') };
}

test('prompt-plan time: NN and wait append lines stamped with the current UTC time to the second, naming the fragment by its build file', (t) => {
  const { time, read } = makePlan(t);
  const start = Math.floor(Date.now() / 1000) * 1000;
  for (const args of [['01'], ['wait', 'the user\'s decision on D1'], ['01'], ['02'], ['03'], ['wait', 'the next request']]) {
    assert.equal(time(...args).status, 0, args.join(' '));
  }
  const lines = read().trimEnd().split('\n').map((line) => line.split('\t'));
  assert.deepEqual(lines.map(([, kind, label]) => [kind, label]), [
    ['01', 'Surface'], ['wait', 'the user\'s decision on D1'], ['01', 'Surface'], ['02', 'Erase procedure'], ['03', 'units'], ['wait', 'the next request'],
  ]);
  const stamps = lines.map(([stamp]) => stamp);
  for (const stamp of stamps) assert.match(stamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  const times = stamps.map(Date.parse);
  assert.ok(times[0] >= start && times.at(-1) <= Date.now(), stamps.join(', '));
  assert.deepEqual([...times].sort((a, b) => a - b), times);
});

test('prompt-plan time: table chains the segments with no gap, keeps waits out of the work, and its totals add up to the second', (t) => {
  const { log, time } = makePlan(t);
  mkdirSync(join(log, '..'), { recursive: true });
  writeFileSync(log, [
    ['14:00:00', '01', 'Surface'], ['14:12:30', '02', 'Erase procedure'], ['14:58:10', 'wait', 'the owner\'s decision | D1'],
    ['15:05:00', '03', 'Units kg and lb'], ['15:31:20', '04', 'Closing'], ['18:36:00', 'wait', 'the next request'],
  ].map(([at, kind, label]) => `2026-11-11T${at}Z\t${kind}\t${label}\n`).join(''));
  const table = time('table');
  assert.equal(table.status, 0, table.stderr);
  assert.equal(table.stderr, '');
  assert.equal(table.stdout, [
    '| # | Task | Start | End | Duration |',
    '| --- | --- | --- | --- | --- |',
    '| 01 | Surface | 14:00:00 | 14:12:30 | 12 min 30 s |',
    '| 02 | Erase procedure | 14:12:30 | 14:58:10 | 45 min 40 s |',
    '| \u2014 | \u23f8\ufe0f Wait: the owner\'s decision \\| D1 | 14:58:10 | 15:05:00 | 6 min 50 s |',
    '| 03 | Units kg and lb | 15:05:00 | 15:31:20 | 26 min 20 s |',
    '| 04 | Closing | 15:31:20 | 18:36:00 | 3 h 04 min 40 s |',
    '| | **Work** | | | **4 h 29 min 10 s** |',
    '| | **Waits** | | | **6 min 50 s** |',
    '| | **Total** | **14:00:00** | **18:36:00** | **4 h 36 min 00 s** |',
    '',
  ].join('\n'));
  assert.equal(readFileSync(log, 'utf8').split('\n').length, 7, 'table wrote to the log');
});

test('prompt-plan time: table shows dates when the lines span days, and warns that an open fragment segment is left out', (t) => {
  const { log, time } = makePlan(t);
  mkdirSync(join(log, '..'), { recursive: true });
  writeFileSync(log, '2026-11-11T23:59:58Z\t01\tSurface\n2026-11-12T00:00:05Z\twait\tD1\n2026-11-12T09:00:05Z\t02\tErase\n');
  const table = time('table');
  assert.equal(table.status, 0, table.stderr);
  assert.match(table.stdout, /^\| 01 \| Surface \| 2026-11-11 23:59:58 \| 2026-11-12 00:00:05 \| 7 s \|$/m);
  assert.match(table.stdout, /^\| \| \*\*Total\*\* \| \*\*2026-11-11 23:59:58\*\* \| \*\*2026-11-12 09:00:05\*\* \| \*\*9 h 00 min 07 s\*\* \|$/m);
  assert.doesNotMatch(table.stdout, /\| 02 \|/);
  assert.match(table.stderr, /fragment 02's segment, open since 2026-11-12T09:00:05Z, is left out/);
});

test('prompt-plan time: misuse and refusals exit 2 and write nothing', (t) => {
  const { log, time, read } = makePlan(t);
  for (const args of [[], ['1'], ['04'], ['00'], ['01', 'extra'], ['wait'], ['wait', ' '], ['wait', 'a\tb'], ['wait', 'a\nb'], ['wait', 'a', 'b'], ['table', 'x'], ['stop']]) {
    const refused = time(...args);
    assert.equal(refused.status, 2, `${args.join(' ')}: ${refused.stdout}${refused.stderr}`);
    assert.equal(read(), '', args.join(' '));
  }
  assert.match(time('table').stderr, /no closed segment/);
  assert.equal(time('01').status, 0);
  assert.equal(time('table').status, 2, 'a single line closes no segment');
  const once = read();
  assert.match(time('01').stderr, /already the open segment/);
  assert.equal(read(), once);
  // A line that time.mjs never writes, or one earlier than the line before it, stops every verb.
  writeFileSync(log, `${once}2020-01-01T00:00:00Z\twait\told\n`);
  for (const args of [['table'], ['02'], ['wait', 'x']]) assert.match(time(...args).stderr, /line 2 of review\/times\.log/, args.join(' '));
  writeFileSync(log, `${once}not a line\n`);
  assert.equal(time('table').status, 2);
});
