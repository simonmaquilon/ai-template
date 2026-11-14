import assert from 'node:assert/strict';
import test from 'node:test';
import { doctor } from '../device-doctor.mjs';
import { boot, shutdown, simulators } from '../device-ios.mjs';

const A = '11111111-AAAA-BBBB-CCCC-000000000001';
const B = '11111111-AAAA-BBBB-CCCC-000000000002';
const C = '11111111-AAAA-BBBB-CCCC-000000000003';
const RUNTIME = 'com.apple.CoreSimulator.SimRuntime.iOS-27-2';
const DEVICES = JSON.stringify({ devices: { [RUNTIME]: [
  { name: 'iPhone A', udid: A, state: 'Shutdown', isAvailable: true },
  { name: 'iPhone B', udid: B, state: 'Booted', isAvailable: true },
  { name: 'iPhone C', udid: C, state: 'Booting', isAvailable: true },
  { name: 'Twin', udid: '11111111-AAAA-BBBB-CCCC-000000000004', state: 'Shutdown' },
  { name: 'Twin', udid: '11111111-AAAA-BBBB-CCCC-000000000005', state: 'Shutdown' },
] } });
const OK = (stdout = '') => ({ status: 0, stdout, stderr: '' });

// A stand-in for the system tools that records each call as [file, ...args, options].
function tools(answers = {}) {
  const calls = [];
  const options = [];
  const run = (file, args, option) => {
    calls.push([file, ...args]);
    options.push(option);
    const key = args.join(' ');
    if (answers[key]) return answers[key];
    return key === 'simctl list devices available --json' ? OK(DEVICES) : OK();
  };
  return { run, calls, options };
}

test('ios lists the simulators through xcrun at its fixed path', () => {
  const { run, calls } = tools();
  assert.equal(simulators(run).length, 5);
  assert.deepEqual(calls, [['/usr/bin/xcrun', 'simctl', 'list', 'devices', 'available', '--json']]);
});

test('ios boots a shut down simulator and waits for it', () => {
  const { run, calls, options } = tools();
  assert.match(boot(run, 'iPhone A', { timeout: 30, now: () => 0 }), /iPhone A \(11111111-AAAA-BBBB-CCCC-000000000001\) booted/);
  assert.deepEqual(calls.slice(1), [['/usr/bin/xcrun', 'simctl', 'boot', A], ['/usr/bin/xcrun', 'simctl', 'bootstatus', A]]);
  assert.deepEqual(options.slice(1), [{ timeout: 30000 }, { timeout: 30000 }]);
});

test('ios gives each tool only the time that is left of --timeout', () => {
  let time = 0;
  const { run, options } = tools();
  const slow = (file, args, option) => { time += 10000; return run(file, args, option); };
  boot(slow, A, { timeout: 60, now: () => time });
  assert.deepEqual(options.map((o) => o.timeout), [30000, 50000, 40000]);
  time = 0;
  options.length = 0;
  boot((file, args, option) => { time += 100000; return run(file, args, option); }, A, { timeout: 60, now: () => time });
  assert.deepEqual(options.map((o) => o.timeout), [30000, 1, 1], 'once the time is gone each tool gets the least a timeout can be');
});

test('ios says a booted simulator is already booted and runs nothing else', () => {
  const { run, calls } = tools();
  assert.match(boot(run, B.toLowerCase(), { timeout: 30 }), /already booted/);
  assert.equal(calls.length, 1);
});

test('ios only waits for a simulator that is already booting', () => {
  const { run, calls } = tools();
  boot(run, C, { timeout: 30 });
  assert.deepEqual(calls.slice(1).map((call) => call[2]), ['bootstatus']);
});

test('ios never passes a name that is not in the list, or an ambiguous one, to a tool', () => {
  const { run, calls } = tools();
  assert.throws(() => boot(run, 'iPhone Z', { timeout: 30 }), /no available simulator is named/);
  assert.throws(() => boot(run, 'Twin', { timeout: 30 }), /use one identifier: .*000000000004.*000000000005/);
  assert.throws(() => shutdown(run, '11111111-AAAA-BBBB-CCCC-0000000000FF'), /no available simulator has the identifier/);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => call[2] === 'list'), 'only the list ran');
});

test('ios reports a tool that fails, with a sanitized first line', () => {
  const failing = tools({ [`simctl boot ${A}`]: { status: 1, stdout: '', stderr: 'Unable to boot\u001b[31m device\nsecond line' } });
  assert.throws(() => boot(failing.run, A, { timeout: 30 }), (error) => /^simctl boot exited with 1: Unable to boot\?\[31m device$/.test(error.message));
  const slow = tools({ [`simctl bootstatus ${A}`]: { status: null, stdout: '', stderr: '', error: Object.assign(new Error('x'), { code: 'ETIMEDOUT' }) } });
  assert.throws(() => boot(slow.run, A, { timeout: 30 }), /simctl bootstatus timed out/);
  assert.throws(() => simulators(tools({ 'simctl list devices available --json': OK('{') }).run), /not JSON/);
});

test('ios shuts a simulator down, or says it is already down', () => {
  const { run, calls } = tools();
  assert.match(shutdown(run, B), /shut down/);
  assert.deepEqual(calls.at(-1), ['/usr/bin/xcrun', 'simctl', 'shutdown', B]);
  const before = calls.length;
  assert.match(shutdown(run, '11111111-AAAA-BBBB-CCCC-000000000004'), /already shut down/);
  assert.equal(calls.length, before + 1, 'only the list ran');
});

test('doctor checks Xcode and a runtime on macOS through the system tools', () => {
  const answers = { 'simctl list runtimes --json': OK(JSON.stringify({ runtimes: [{ identifier: RUNTIME, isAvailable: true }] })), '-p': OK('/Applications/Xcode.app/Contents/Developer\n') };
  const { run, calls } = tools(answers);
  const { rows, ok } = doctor({ platform: 'ios', env: {}, os: 'darwin', run });
  assert.deepEqual(rows.map((r) => [r.status, r.name]), [['ok', 'node'], ['ok', 'ios/xcode'], ['ok', 'ios/runtime']]);
  assert.equal(ok, true);
  assert.deepEqual(calls, [['/usr/bin/xcode-select', '-p'], ['/usr/bin/xcrun', 'simctl', 'list', 'runtimes', '--json']]);
});

test('doctor says how to fix a missing Xcode or runtime', () => {
  const answers = { '-p': { status: 2, stdout: '', stderr: 'xcode-select: error: unable to get active developer directory' },
    'simctl list runtimes --json': OK('{"runtimes": []}') };
  const { rows, ok } = doctor({ platform: 'ios', env: {}, os: 'darwin', run: tools(answers).run });
  assert.equal(ok, false);
  assert.match(rows[1].detail, /install Xcode and select it/);
  assert.deepEqual([rows[2].status, rows[2].detail], ['missing', 'no iOS simulator runtime; download one from Xcode (Settings, Components)']);
});

test('doctor reports iOS as unavailable outside macOS, and runs nothing', () => {
  const { run, calls } = tools();
  const { rows, ok } = doctor({ platform: 'ios', env: {}, os: 'linux', run });
  assert.deepEqual(rows[1], { status: 'unavailable', name: 'ios', detail: 'simulators exist only on macOS' });
  assert.equal(ok, false);
  assert.equal(calls.length, 0);
});
