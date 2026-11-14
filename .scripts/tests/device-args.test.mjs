import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArgs } from '../device-args.mjs';

const UDID = '0a1b2c3d-1111-2222-3333-444455556666';

test('device reads each command with its options', () => {
  assert.deepEqual(parseArgs(['doctor']), { command: 'doctor', platform: undefined, json: false, headless: false, target: undefined, timeout: undefined });
  assert.equal(parseArgs(['doctor', '--platform', 'ios']).platform, 'ios');
  assert.equal(parseArgs(['list', '--platform=android', '--json']).json, true);
  const boot = parseArgs(['boot', 'android', 'Pixel_8-API.34', '--headless', '--timeout', '60']);
  assert.deepEqual([boot.platform, boot.target, boot.headless, boot.timeout], ['android', 'Pixel_8-API.34', true, 60]);
  assert.equal(parseArgs(['boot', 'ios', 'iPad Pro (12.9-inch) (6th generation)']).target, 'iPad Pro (12.9-inch) (6th generation)');
  assert.equal(parseArgs(['boot', 'ios', UDID, '--timeout=900']).target, UDID.toUpperCase());
  assert.equal(parseArgs(['shutdown', 'android', 'emulator-5554']).target, 'emulator-5554');
  assert.equal(parseArgs(['shutdown', 'android', 'Pixel_8']).target, 'Pixel_8');
});

const REJECTED = {
  'no command': [[], /is not a command/],
  'unknown command': [['erase', 'ios', 'x'], /is not a command/],
  'inherited property as a command': [['constructor'], /is not a command/],
  'unknown option': [['list', '--all'], /not allowed for list/],
  'option of another command': [['doctor', '--json'], /not allowed for doctor/],
  'short option': [['list', '-j'], /not allowed for list/],
  'double dash': [['boot', 'android', 'Pixel', '--'], /not allowed for boot/],
  'a repeated option': [['list', '--json', '--json'], /given twice/],
  'a flag with a value': [['list', '--json=1'], /takes no value/],
  'an option without a value': [['doctor', '--platform'], /needs a value/],
  'an option that swallows another': [['boot', 'android', 'Pixel', '--timeout', '--headless'], /needs a value/],
  'a bad platform': [['list', '--platform', 'windows'], /platform is one of/],
  'a missing target': [['boot', 'android'], /takes a platform and a target/],
  'an extra argument': [['doctor', 'extra'], /takes no arguments/],
  'a platform missing in boot': [['boot', 'Pixel'], /takes a platform and a target/],
  'headless on ios': [['boot', 'ios', 'iPhone', '--headless'], /only to android/],
  'headless in shutdown': [['shutdown', 'android', 'Pixel', '--headless'], /not allowed for shutdown/],
  'a timeout of zero': [['boot', 'ios', 'iPhone', '--timeout', '0'], /whole number of seconds from 1 to 900/],
  'a timeout above the range': [['boot', 'ios', 'iPhone', '--timeout', '901'], /from 1 to 900/],
  'a timeout that is not a number': [['boot', 'ios', 'iPhone', '--timeout', '1e2'], /from 1 to 900/],
  'a negative timeout': [['boot', 'ios', 'iPhone', '--timeout=-5'], /from 1 to 900/],
  'an emulator name that starts with a dot': [['boot', 'android', '.hidden'], /not an emulator name/],
  'a name with a path': [['boot', 'android', '../Pixel'], /not an emulator name/],
  'a name with a space for android': [['boot', 'android', 'Pixel 8'], /not an emulator name/],
  'a name that is an option': [['boot', 'ios', '-iPhone'], /not allowed for boot/],
  'a shell metacharacter': [['boot', 'ios', 'iPhone; rm -rf'], /not a simulator identifier or name/],
  'a command substitution': [['boot', 'ios', '$(id)'], /not a simulator identifier or name/],
  'a control character': [['boot', 'ios', 'iPhone\u001b[31m'], /not a simulator identifier or name/],
  'a text direction mark': [['boot', 'ios', 'iPhone\u202e'], /not a simulator identifier or name/],
  'an empty name': [['shutdown', 'ios', ''], /not a simulator identifier or name/],
  'a physical device serial': [['shutdown', 'android', '192.168.0.5:5555'], /not an emulator serial/],
  'a long name': [['shutdown', 'ios', 'a'.repeat(65)], /not a simulator identifier or name/],
};

for (const [title, [argv, message]] of Object.entries(REJECTED)) {
  test(`device refuses ${title}`, () => {
    assert.throws(() => parseArgs(argv), message);
  });
}

test('device never echoes control characters of a rejected value', () => {
  assert.throws(() => parseArgs(['list', '--platform', 'x\u001b[2Jy']), (error) => !/[\u001b]/.test(error.message));
});
