// Reads the command line of device.mjs against a closed list of commands and options. It is the first thing the launcher
// does, before any binary is looked for or run: anything outside the list, or a value outside its pattern or range,
// throws an Error that says what to correct. Options are "--name value" or "--name=value" ("--" is not supported).

import { AVD, SERIAL, SIM_NAME, UDID, clean } from './device-parse.mjs';

export const TIMEOUT = [1, 900];
const PLATFORMS = ['android', 'ios'];
const COMMANDS = {
  doctor: { positional: 0, options: { platform: 'value' } },
  list: { positional: 0, options: { platform: 'value', json: 'flag' } },
  boot: { positional: 2, options: { headless: 'flag', timeout: 'value' } },
  shutdown: { positional: 2, options: {} },
};
const USAGE = 'usage: doctor [--platform android|ios] | list [--platform android|ios] [--json] | '
  + 'boot android|ios <target> [--headless] [--timeout <seconds>] | shutdown android|ios <target>';

function platform(value) {
  if (!PLATFORMS.includes(value)) throw new Error(`the platform is one of ${PLATFORMS.join(', ')}, not "${clean(value ?? '', 20)}"`);
  return value;
}

function target(command, os, value) {
  const ok = os === 'ios' ? UDID.test(value) || SIM_NAME.test(value)
    : command === 'boot' ? AVD.test(value) : SERIAL.test(value) || AVD.test(value);
  if (!ok) {
    const what = os === 'ios' ? 'a simulator identifier or name (letters, digits, spaces and . _ ( ) \' + -)'
      : command === 'boot' ? 'an emulator name (letters, digits, "." "_" "-")' : 'an emulator serial (emulator-<port>) or name';
    throw new Error(`"${clean(value, 40)}" is not ${what}`);
  }
  return UDID.test(value) ? value.toUpperCase() : value;
}

function timeout(value) {
  const seconds = /^[1-9]\d{0,3}$/.test(value) ? Number(value) : NaN;
  if (!(seconds >= TIMEOUT[0] && seconds <= TIMEOUT[1])) throw new Error(`--timeout is a whole number of seconds from ${TIMEOUT[0]} to ${TIMEOUT[1]}`);
  return seconds;
}

// The request as { command, platform, target, json, headless, timeout }, or an Error that says what to correct.
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!Object.hasOwn(COMMANDS, command ?? '')) throw new Error(`"${clean(command ?? '', 40)}" is not a command; ${USAGE}`);
  const { positional: count, options: allowed } = COMMANDS[command];
  const given = {};
  const values = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('-')) {
      values.push(arg);
      continue;
    }
    const [, name, inline] = /^--([a-z-]+)(?:=([\s\S]*))?$/.exec(arg) ?? [];
    if (!Object.hasOwn(allowed, name ?? '')) throw new Error(`option "${clean(arg, 40)}" is not allowed for ${command}; ${USAGE}`);
    if (Object.hasOwn(given, name)) throw new Error(`--${name} is given twice`);
    if (allowed[name] === 'flag') {
      if (inline !== undefined) throw new Error(`--${name} takes no value`);
      given[name] = true;
    } else {
      const value = inline ?? (rest[i + 1]?.startsWith('-') === false ? rest[++i] : undefined);
      if (value === undefined) throw new Error(`--${name} needs a value`);
      given[name] = value;
    }
  }
  if (values.length !== count) throw new Error(`${command} takes ${count === 0 ? 'no arguments' : 'a platform and a target'}; ${USAGE}`);
  const os = count === 0 ? (given.platform === undefined ? undefined : platform(given.platform)) : platform(values[0]);
  if (given.headless && os !== 'android') throw new Error('--headless applies only to android');
  return { command, platform: os, json: given.json === true, headless: given.headless === true,
    target: count === 0 ? undefined : target(command, os, values[1]),
    timeout: given.timeout === undefined ? undefined : timeout(given.timeout) };
}
