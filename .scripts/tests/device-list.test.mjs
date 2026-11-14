import assert from 'node:assert/strict';
import test from 'node:test';
import { anyAvailable, collect, lines } from '../device-list.mjs';

const UDID = '11111111-AAAA-BBBB-CCCC-000000000001';
const DEVICES = JSON.stringify({ devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-27-2': [
  { name: 'iPhone\u202e\u001b[31m A', udid: UDID, state: 'Booted', isAvailable: true },
] } });
const iosRun = () => () => ({ status: 0, stdout: DEVICES, stderr: '' });
const androidContext = () => ({
  sdk: { adb: '/sdk/adb', emulator: '/sdk/emulator' },
  run: (file, args) => ({ status: 0, stdout: file.endsWith('emulator') ? 'Pixel_8\nTablet\n' : args[0] === 'devices' ? 'List of devices attached\nemulator-5554\tdevice\n' : 'Pixel_8\nOK\n', stderr: '' }),
});
const missing = () => { throw new Error('the Android SDK was not found\u001b[0m'); };

test('list prints each platform with sanitized simulator names', () => {
  const result = collect(undefined, { androidContext, iosRun });
  assert.deepEqual(lines(result), ['android', '  Pixel_8\trunning\temulator-5554', '  Tablet\tstopped',
    'ios', `  iPhone??[31m A\t${UDID}\tiOS 27.2\tBooted`]);
  assert.equal(JSON.stringify(result).includes('\u202e'), false);
  assert.equal(anyAvailable(result), true);
});

test('list reports an unavailable platform with its reason, in text and in JSON', () => {
  const result = collect(undefined, { androidContext: missing, iosRun });
  assert.deepEqual(lines(result)[0], 'android: unavailable (the Android SDK was not found?[0m)');
  assert.deepEqual(JSON.parse(JSON.stringify(result)).android, { available: false, reason: 'the Android SDK was not found?[0m' });
  assert.equal(anyAvailable(result), true);
  const none = collect('android', { androidContext: missing, iosRun });
  assert.deepEqual(Object.keys(none), ['android']);
  assert.equal(anyAvailable(none), false);
});

test('list says when a platform has no devices', () => {
  const result = collect('ios', { androidContext, iosRun: () => () => ({ status: 0, stdout: '{"devices": {}}', stderr: '' }) });
  assert.deepEqual(lines(result), ['ios', '  (none)']);
});
