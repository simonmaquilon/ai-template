import assert from 'node:assert/strict';
import test from 'node:test';
import { boot, list, running, shutdown } from '../device-android.mjs';

const OK = (stdout = '') => ({ status: 0, stdout, stderr: '' });
const SDK = { adb: '/sdk/adb', emulator: '/sdk/emulator' };

// A stand-in for adb and emulator: `emulators` is [serial, avd, state] triples (state defaults to `device`), `devices` may
// be a function of the call number, and `source` is where the name comes from: the boot property, the kernel property of
// older images, the console command `emu avd name`, or nowhere.
function tools({ avds = ['Pixel_8', 'Tablet'], emulators = [], devices, source = 'boot' } = {}) {
  const calls = [];
  const options = [];
  let devicesCalls = 0;
  const run = (file, args, option) => {
    calls.push([file, ...args].join(' '));
    options.push(option);
    const key = args.join(' ');
    if (file === SDK.emulator) return OK(`${avds.join('\n')}\n`);
    const listed = emulators.map(([serial, , state = 'device']) => `${serial}\t${state}\n`).join('');
    if (key === 'devices') return (devices ? devices(devicesCalls++) : null) ?? OK(`List of devices attached\n${listed}`);
    const [, serial, rest] = /^-s (\S+) (.*)$/.exec(key) ?? [];
    const name = emulators.find(([id]) => id === serial)?.[1];
    const answers = { 'shell getprop ro.boot.qemu.avd_name': source === 'boot' ? `${name}\n` : '\n',
      'shell getprop ro.kernel.qemu.avd_name': source === 'kernel' ? `${name}\n` : '\n',
      'emu avd name': source === 'console' ? `${name}\nOK\n` : '', 'shell getprop sys.boot_completed': '1\n' };
    return OK(answers[rest] ?? '');
  };
  return { ctx: { sdk: SDK, run }, calls, options };
}

const clock = () => {
  let time = 0;
  return { now: () => time, sleep: async (ms) => { time += ms; } };
};
const child = (problem) => ({ problem: () => problem });

test('android boot stops at once when the emulator process fails to start or ends with an error', async () => {
  const { ctx, calls } = tools();
  for (const problem of ['did not start (ENOENT)', 'ended with 3']) {
    await assert.rejects(boot(ctx, 'Pixel_8', { timeout: 30, start: () => child(problem), ...clock() }), new RegExp(`the emulator process ${problem.replace(/[()]/g, '\\$&')} before Pixel_8 was ready; start it by hand`));
  }
  assert.ok(!calls.some((call) => / kill/.test(call)));
});

test('android boot retries an adb error and then succeeds', async () => {
  const { ctx } = tools({ emulators: [['emulator-5556', 'Pixel_8']], devices: (n) => (n === 0 ? OK('List of devices attached\n') : n === 1 ? { status: 1, stdout: '', stderr: 'adb server is out of date' } : null) });
  assert.equal(await boot(ctx, 'Pixel_8', { timeout: 30, start: () => child(undefined), ...clock() }), 'Pixel_8 booted as emulator-5556');
});

test('android boot reports the last adb error when time runs out', async () => {
  const { ctx } = tools({ devices: (n) => (n === 0 ? null : { status: 1, stdout: '', stderr: 'cannot connect\u001b[0m' }) });
  await assert.rejects(boot(ctx, 'Pixel_8', { timeout: 5, start: () => child(undefined), ...clock() }),
    /^Error: Pixel_8 was not ready after 5 s \(last adb error: adb devices exited with 1: cannot connect\?\[0m\); it may still be starting/);
});

test('android boot gives each call only the time that is left of --timeout', async () => {
  const time = clock();
  const { ctx, options } = tools({ emulators: [['emulator-5556', 'Pixel_8']] });
  const slow = (file, args, option) => { time.sleep(7000); return ctx.run(file, args, option); };
  await boot({ ...ctx, run: slow }, 'Pixel_8', { timeout: 20, start: () => child(undefined), ...time }).catch(() => {});
  assert.ok(options.length >= 3 && options.every((o) => o.timeout <= 30000 && o.timeout >= 1));
  assert.deepEqual(options.slice(0, 3).map((o) => o.timeout), [20000, 13000, 6000]);
  assert.equal(options.at(-1).timeout >= 1, true);
});

test('android shutdown by name refuses several running emulators with that name', () => {
  const { ctx, calls } = tools({ emulators: [['emulator-5554', 'Pixel_8'], ['emulator-5556', 'Pixel_8']] });
  assert.throws(() => shutdown(ctx, 'Pixel_8'), /several running emulators match "Pixel_8"; running emulators: emulator-5554 \(Pixel_8\), emulator-5556 \(Pixel_8\)/);
  assert.ok(!calls.some((call) => / kill/.test(call)));
});

test('android shutdown of an emulator that exists but is not running is not an error, and kills nothing', () => {
  const { ctx, calls } = tools({ emulators: [['emulator-5554', 'Pixel_8']] });
  assert.equal(shutdown(ctx, 'Tablet'), 'Tablet is not running');
  assert.throws(() => shutdown(ctx, 'Nope'), /no emulator is named "Nope"; available: Pixel_8, Tablet/);
  assert.throws(() => shutdown(ctx, 'emulator-5560'), /no running emulator matches "emulator-5560"/);
  assert.ok(!calls.some((call) => / kill/.test(call)));
});

test('android reads the name of a running emulator from the boot property, then the kernel property, then the console', () => {
  for (const source of ['boot', 'kernel', 'console']) {
    const { ctx } = tools({ emulators: [['emulator-5554', 'Pixel_8']], source });
    assert.deepEqual(running(ctx), [{ serial: 'emulator-5554', state: 'device', avd: 'Pixel_8' }], source);
    assert.deepEqual(list(ctx), [{ name: 'Pixel_8', serial: 'emulator-5554' }, { name: 'Tablet', serial: undefined }], source);
  }
  const none = tools({ emulators: [['emulator-5554', 'Pixel_8']], source: 'none' });
  assert.equal(running(none.ctx)[0].avd, undefined, 'an emulator that answers no name is not matched to any');
});

test('android takes a name only if it matches the AVD pattern', () => {
  const run = (file, args) => OK(args.join(' ') === 'devices' ? 'List of devices attached\nemulator-5554\tdevice\n' : 'bad name; rm\n');
  assert.equal(running({ sdk: SDK, run })[0].avd, undefined);
});

test('android gives an offline emulator no name and asks it nothing', () => {
  const { ctx, calls } = tools({ emulators: [['emulator-5554', 'Pixel_8', 'offline']] });
  assert.deepEqual(running(ctx), [{ serial: 'emulator-5554', state: 'offline', avd: undefined }]);
  assert.deepEqual(calls, ['/sdk/adb devices']);
});

test('android boot waits through the offline state and then finds the emulator', async () => {
  const { ctx } = tools({ emulators: [['emulator-5556', 'Pixel_8']], devices: (n) => (n === 0 ? OK('List of devices attached\n') : n === 1 ? OK('List of devices attached\nemulator-5556\toffline\n') : null) });
  assert.equal(await boot(ctx, 'Pixel_8', { timeout: 30, start: () => child(undefined), ...clock() }), 'Pixel_8 booted as emulator-5556');
});

test('android boot does not blame adb when its last call only ran out of the time that was left', async () => {
  const { ctx } = tools();
  const timedOut = (file, args, option) => (option.timeout <= 3000 ? { status: null, stdout: '', stderr: '', error: Object.assign(new Error('x'), { code: 'ETIMEDOUT' }) } : ctx.run(file, args, option));
  const time = clock();
  const slow = (file, args, option) => { time.sleep(2000); return timedOut(file, args, option); };
  await assert.rejects(boot({ ...ctx, run: slow }, 'Pixel_8', { timeout: 6, start: () => child(undefined), ...time }), (error) => /^Pixel_8 was not ready after 6 s; it may still be starting/.test(error.message));
});
