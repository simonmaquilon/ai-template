import assert from 'node:assert/strict';
import test from 'node:test';
import { clean, emulators, matchAvd, matchSimulator, parseAdbDevices, parseAvdName, parseAvds, parseRuntimes, parseSimulators } from '../device-parse.mjs';

const A = '11111111-AAAA-BBBB-CCCC-000000000001';
const B = '11111111-AAAA-BBBB-CCCC-000000000002';
const SIMCTL = JSON.stringify({ devices: {
  'com.apple.CoreSimulator.SimRuntime.iOS-27-2': [
    { name: 'iPhone 17', udid: A.toLowerCase(), state: 'Shutdown', isAvailable: true },
    { name: 'iPhone 17', udid: B, state: 'Booted', isAvailable: true },
    { name: 'Old', udid: 'not-an-identifier', state: 'Shutdown' },
    { name: 'Gone', udid: '11111111-AAAA-BBBB-CCCC-000000000003', state: 'Shutdown', isAvailable: false },
    { name: 'Odd', udid: '11111111-AAAA-BBBB-CCCC-000000000004', state: 'x\u001b[2J' },
  ],
  'com.apple.CoreSimulator.SimRuntime.watchOS-12-0': [{ name: 'Watch', udid: '11111111-AAAA-BBBB-CCCC-000000000005', state: 'Shutdown' }],
  'com.apple.CoreSimulator.SimRuntime.iOS-18-0': 'not a list',
  'other-key': [],
} });

test('device reads emulator -list-avds and drops notices', () => {
  assert.deepEqual(parseAvds('INFO    | Storing crashdata in: /tmp/x\nPixel_8\r\n\n  Tablet-34  \nbad name\n.hidden\n-x\n'), ['Pixel_8', 'Tablet-34']);
});

test('device reads adb devices and keeps only emulators as emulators', () => {
  const text = '* daemon not running; starting now at tcp:5037\n* daemon started successfully\nList of devices attached\n'
    + 'emulator-5554\tdevice\nR5CT123ABC\tdevice\nemulator-5556\toffline\nXYZ\tno permissions (user in plugdev group)\n';
  const devices = parseAdbDevices(text);
  assert.deepEqual(devices.map((d) => d.serial), ['emulator-5554', 'R5CT123ABC', 'emulator-5556']);
  assert.deepEqual(emulators(devices), [{ serial: 'emulator-5554', state: 'device' }, { serial: 'emulator-5556', state: 'offline' }]);
});

test('device reads the name adb reports for an emulator', () => {
  assert.equal(parseAvdName('Pixel_8\nOK\n'), 'Pixel_8');
  assert.equal(parseAvdName('Pixel_8\r\nOK\r\n'), 'Pixel_8');
  assert.equal(parseAvdName('KO: unknown command\n'), undefined);
  assert.equal(parseAvdName('bad name\nOK\n'), undefined);
});

test('device reads the simulators simctl lists, iOS only', () => {
  assert.deepEqual(parseSimulators(SIMCTL), [
    { name: 'iPhone 17', udid: A, runtime: 'iOS 27.2', state: 'Shutdown' },
    { name: 'iPhone 17', udid: B, runtime: 'iOS 27.2', state: 'Booted' },
    { name: 'Odd', udid: '11111111-AAAA-BBBB-CCCC-000000000004', runtime: 'iOS 27.2', state: 'Unknown' },
  ]);
  assert.throws(() => parseSimulators('nope'), /not JSON/);
  assert.throws(() => parseSimulators('{"runtimes": []}'), /no "devices"/);
  assert.throws(() => parseSimulators('null'), /no "devices"/);
});

test('device reads the available iOS runtimes', () => {
  const text = JSON.stringify({ runtimes: [
    { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-27-2', isAvailable: true },
    { identifier: 'com.apple.CoreSimulator.SimRuntime.tvOS-27-0', isAvailable: true },
    { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-26-0', isAvailable: false },
  ] });
  assert.deepEqual(parseRuntimes(text), ['iOS 27.2']);
  assert.deepEqual(parseRuntimes('{"runtimes": []}'), []);
});

test('device matches a simulator by identifier or exact name and refuses the rest', () => {
  const sims = parseSimulators(SIMCTL);
  assert.equal(matchSimulator(sims, A.toLowerCase()).udid, A);
  assert.equal(matchSimulator(sims, 'Odd').udid, '11111111-AAAA-BBBB-CCCC-000000000004');
  assert.throws(() => matchSimulator(sims, 'iPhone 17'), new RegExp(`${A} \\(iOS 27.2\\), ${B}`));
  assert.throws(() => matchSimulator(sims, 'iphone 17'), /no available simulator is named/);
  assert.throws(() => matchSimulator(sims, '11111111-AAAA-BBBB-CCCC-0000000000FF'), /no available simulator has the identifier/);
});

test('device matches an emulator name exactly', () => {
  assert.equal(matchAvd(['Pixel_8'], 'Pixel_8'), 'Pixel_8');
  assert.throws(() => matchAvd(['Pixel_8'], 'Pixel_'), /no emulator is named "Pixel_"; available: Pixel_8/);
  assert.throws(() => matchAvd([], 'Pixel_8'), /available: none/);
});

test('device makes text safe to print', () => {
  assert.equal(clean('a\u001b[31mb\u202ec\u200bd\u2028e\u0000'), 'a?[31mb?c?d?e?');
  assert.equal(clean('x'.repeat(500)).length, 200);
  assert.equal(clean('x'.repeat(500), 1000).length, 500);
  const invisible = ['\u{e0041}', '\u2060', '\u2064', '\u00ad', '\u180e', '\ufe0f', '\u{e0100}', '\u3164', '\uffa0', '\u115f', '\u1160',
    '\ufff9', '\u0085', '\u007f', '\u2029', '\u061c', '\u200d', '\ud800', '\n', '\t'];
  for (const char of invisible) assert.equal(clean(`a${char}b`), 'a?b', `U+${char.codePointAt(0).toString(16)}`);
  assert.equal(clean('Sim\u00f3n \u65e5\u672c iPhone (2)'), 'Sim\u00f3n \u65e5\u672c iPhone (2)');
});

test('device lists at most eight identifiers of an ambiguous simulator name', () => {
  const sims = Array.from({ length: 11 }, (_, i) => ({ name: 'Twin', udid: `11111111-AAAA-BBBB-CCCC-0000000000${String(i).padStart(2, '0')}`, runtime: 'iOS 27.2', state: 'Shutdown' }));
  assert.throws(() => matchSimulator(sims, 'Twin'), (error) => error.message.includes('000000000007') && !error.message.includes('000000000008') && /and 3 more$/.test(error.message));
});
