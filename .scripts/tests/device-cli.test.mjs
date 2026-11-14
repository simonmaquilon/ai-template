import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { SKIP, fixture } from './device-fixture.mjs';

const OPTIONS = { skip: SKIP };

test('device refuses what is outside its closed list before it runs anything', OPTIONS, (t) => {
  const device = fixture(t, { avds: ['Pixel_8'] });
  const refused = [['erase'], ['boot'], ['boot', 'android', '../Pixel_8'], ['boot', 'android', 'Pixel 8'], ['boot', 'android', 'Pixel_8', '--timeout', '0'],
    ['boot', 'android', 'Pixel_8', '--timeout', '9999'], ['boot', 'ios', 'x', '--headless'], ['list', '--platform', 'windows'], ['list', '--bogus'],
    ['shutdown', 'android', '192.168.0.5:5555'], ['doctor', 'extra'], ['boot', 'android', '$(touch pwned)'], ['boot', 'android', 'Pixel_8', '--']];
  for (const args of refused) {
    const result = device(args);
    assert.equal(result.status, 1, args.join(' '));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^device: .+/, args.join(' '));
  }
  assert.deepEqual(device.calls(), [], 'no binary ran');
});

test('device lists the emulators, which are running, and their serial, never a physical device', OPTIONS, (t) => {
  const device = fixture(t, { avds: ['Pixel_8', 'Tablet'], running: { 'emulator-5554': 'Pixel_8' }, devices: 'R5CT123ABC\tdevice\n' });
  const text = device(['list', '--platform', 'android']);
  assert.equal(text.status, 0, text.stderr);
  assert.equal(text.stdout, 'android\n  Pixel_8\trunning\temulator-5554\n  Tablet\tstopped\n');
  const json = JSON.parse(device(['list', '--platform', 'android', '--json']).stdout);
  assert.deepEqual(json, { android: { available: true, emulators: [{ name: 'Pixel_8', serial: 'emulator-5554' }, { name: 'Tablet' }] } });
  const calls = device.calls();
  assert.ok(calls.every((call) => call.startsWith(device.sdk)), 'every binary is under the SDK');
  assert.ok(!calls.some((call) => call.includes('R5CT123ABC')), 'the physical device was never addressed');
});

test('device lists a running emulator of an older image, whose name is in the kernel property', OPTIONS, (t) => {
  const device = fixture(t, { avds: ['Pixel_8'], running: { 'emulator-5554': 'Pixel_8' }, oldImage: true });
  assert.equal(device(['list', '--platform', 'android']).stdout, 'android\n  Pixel_8\trunning\temulator-5554\n');
  assert.equal(device(['boot', 'android', 'Pixel_8']).stdout, 'Pixel_8 is already running as emulator-5554 (device)\n');
});

test('device says an emulator is already running and exits with 0 without starting it', OPTIONS, (t) => {
  const device = fixture(t, { avds: ['Pixel_8'], running: { 'emulator-5554': 'Pixel_8' } });
  const result = device(['boot', 'android', 'Pixel_8']);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'Pixel_8 is already running as emulator-5554 (device)\n');
  assert.ok(!device.calls().some((call) => / -avd /.test(call)), 'the emulator was not launched');
});

test('device never lets a name that is not in the list reach a binary', OPTIONS, (t) => {
  const device = fixture(t, { avds: ['Pixel_8'], running: { 'emulator-5554': 'Pixel_8' } });
  for (const args of [['boot', 'android', 'Pixel_9'], ['shutdown', 'android', 'Pixel_9'], ['shutdown', 'android', 'emulator-5560']]) {
    const result = device(args);
    assert.equal(result.status, 1, args.join(' '));
    assert.match(result.stderr, /^device: (no emulator is named|no running emulator matches)/);
  }
  assert.ok(!device.calls().some((call) => /Pixel_9|emulator-5560| -avd | kill/.test(call)), 'nothing but the lists ran');
});

test('device starts an emulator headless and waits for it to boot', OPTIONS, (t) => {
  const device = fixture(t, { avds: ['Pixel_8'], autostart: true });
  const result = device(['boot', 'android', 'Pixel_8', '--headless', '--timeout', '30']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'Pixel_8 booted as emulator-5556\n');
  assert.ok(device.calls().some((call) => call === `${device.sdk}/emulator/emulator -avd Pixel_8 -no-window -no-audio`));
  assert.ok(device.calls().includes(`${device.sdk}/platform-tools/adb -s emulator-5556 shell getprop sys.boot_completed`));
  const calls = device.calls();
  assert.ok(calls.includes(`${device.sdk}/platform-tools/adb -s emulator-5556 shell getprop ro.boot.qemu.avd_name`), 'the name came from the boot property');
  assert.ok(!calls.some((call) => / emu avd name/.test(call)), 'the console, which answers nothing, was not needed');
  assert.ok(calls.filter((call) => call.endsWith(' devices')).length >= 3, 'it saw the emulator offline first and polled again');
});

test('device gives up after --timeout when the emulator never shows up, and leaves it alone', OPTIONS, (t) => {
  const device = fixture(t, { avds: ['Pixel_8'] });
  const result = device(['boot', 'android', 'Pixel_8', '--timeout', '5']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^device: Pixel_8 was not ready after 5 s( \(last adb error: adb devices timed out\))?; it may still be starting/);
  assert.ok(!device.calls().some((call) => / kill/.test(call)));
});

test('device shuts down an emulator by serial or name, and only an emulator', OPTIONS, (t) => {
  const device = fixture(t, { avds: ['Pixel_8', 'Tablet'], running: { 'emulator-5554': 'Pixel_8' }, devices: 'R5CT123ABC\tdevice\n' });
  const stopped = device(['shutdown', 'android', 'Tablet']);
  assert.deepEqual([stopped.status, stopped.stdout], [0, 'Tablet is not running\n']);
  assert.equal(device(['shutdown', 'android', 'emulator-5554']).stdout, 'shutdown requested for emulator-5554\n');
  assert.equal(device(['shutdown', 'android', 'Pixel_8']).status, 0);
  const physical = device(['shutdown', 'android', 'R5CT123ABC']);
  assert.equal(physical.status, 1);
  assert.match(physical.stderr, /^device: no emulator is named "R5CT123ABC"/);
  const kills = device.calls().filter((call) => / emu kill/.test(call));
  assert.deepEqual(kills, [`${device.sdk}/platform-tools/adb -s emulator-5554 emu kill`, `${device.sdk}/platform-tools/adb -s emulator-5554 emu kill`]);
});

test('device doctor passes android with the SDK and java, and finds nothing on PATH', OPTIONS, (t) => {
  const device = fixture(t, { avds: [] });
  const ok = device(['doctor', '--platform', 'android']);
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /^ok +node: v\d+/);
  assert.match(ok.stdout, /ok +android\/java: openjdk version "21\.0\.1"\n/);
  assert.match(ok.stdout, new RegExp(`ok +android/sdk adb: ${device.sdk}/platform-tools/adb\\n`));
  const bin = join(device.dir, 'path');
  mkdirSync(bin);
  for (const name of ['adb', 'emulator']) {
    writeFileSync(join(bin, name), `#!/bin/sh\necho "$0" >> "${join(device.dir, 'path.log')}"\n`);
    chmodSync(join(bin, name), 0o755);
  }
  const missing = device(['doctor', '--platform', 'android'], { ANDROID_HOME: '', PATH: `${bin}:${process.env.PATH}` });
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /missing +android\/sdk adb: ANDROID_HOME and ANDROID_SDK_ROOT are unset; set ANDROID_HOME/);
  assert.equal(existsSync(join(device.dir, 'path.log')), false, 'the adb and emulator on PATH never ran');
});

test('device refuses an SDK binary that is a symbolic link', OPTIONS, (t) => {
  const device = fixture(t, { avds: ['Pixel_8'] });
  rmSync(join(device.sdk, 'platform-tools', 'adb'));
  symlinkSync(join(device.sdk, 'emulator', 'emulator'), join(device.sdk, 'platform-tools', 'adb'));
  const result = device(['list', '--platform', 'android']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^android: unavailable \(the Android SDK was not found; run: node \.scripts\/device\.mjs doctor/);
  assert.deepEqual(device.calls(), []);
});

test('device stops waiting when the emulator process ends with an error', OPTIONS, (t) => {
  const device = fixture(t, { avds: ['Pixel_8'], emulatorExit: 3 });
  const result = device(['boot', 'android', 'Pixel_8', '--timeout', '30']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^device: the emulator process ended with 3 before Pixel_8 was ready; start it by hand/);
});

test('device lists an unavailable platform in JSON and exits with 1 when none can be read', OPTIONS, (t) => {
  const device = fixture(t);
  const result = device(['list', '--platform', 'android', '--json'], { ANDROID_HOME: '' });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), { android: { available: false, reason: 'the Android SDK was not found; run: node .scripts/device.mjs doctor --platform android' } });
});

test('device refuses an SDK that lies inside its own folder or the temporary folder, and runs nothing', OPTIONS, (t) => {
  const device = fixture(t, { avds: ['Pixel_8'] });
  for (const parent of [device.launcher, join(device.dir, 'tmp')]) {
    const inside = join(parent, 'sdk-copy');
    cpSync(device.sdk, inside, { recursive: true });
    const list = device(['list', '--platform', 'android'], { ANDROID_HOME: inside });
    assert.equal(list.status, 1);
    assert.match(list.stdout, /^android: unavailable \(ANDROID_HOME is inside the repository or the temporary folder/);
    assert.match(device(['doctor', '--platform', 'android'], { ANDROID_HOME: inside }).stdout, /missing +android\/sdk adb: ANDROID_HOME is inside the repository/);
    assert.match(device(['doctor', '--platform', 'android'], { JAVA_HOME: join(parent, 'jdk-none') }).stdout, /missing +android\/java: JAVA_HOME is not an existing folder/);
  }
  assert.deepEqual(device.calls(), [], 'nothing ran');
});
