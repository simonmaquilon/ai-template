// Pure parts of the device launcher (device.mjs): the closed patterns every name and identifier must match, the readers
// of what the Android and iOS tools print, and the matching of a request against the real lists. Nothing here runs a
// binary or touches the file system, so every function is tested without a device.

export const AVD = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
export const SERIAL = /^emulator-\d{4,5}$/;
export const UDID = /^[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}$/i;
export const SIM_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._()'+-]{0,63}$/u;
const RUNTIME = /^com\.apple\.CoreSimulator\.SimRuntime\.([A-Za-z]+)-(\d+(?:-\d+)*)$/;

// A text that came from a binary, a device name or the command line, made safe to print: control, format (text
// direction, zero-width, tag), line and paragraph separator and lone surrogate characters, variation selectors and the
// Hangul fillers become "?", and it is cut to `max` characters.
const UNSAFE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\u180e\u115f\u1160\u3164\uffa0\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/gu;
export const clean = (text, max = 200) => String(text).slice(0, max).replace(UNSAFE, '?');

const lines = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

// `emulator -list-avds`: one name per line; any other line, such as a log notice, is dropped.
export const parseAvds = (text) => lines(text).filter((line) => AVD.test(line));

// `adb devices`: "<serial> <state>" after a header; daemon notices and entries with a longer state are dropped.
export function parseAdbDevices(text) {
  return lines(text).flatMap((line) => {
    const match = /^([A-Za-z0-9._:-]{1,64})\s+([a-z]+)$/.exec(line);
    return match ? [{ serial: match[1], state: match[2] }] : [];
  });
}

// Emulators only: a physical device never has an "emulator-<port>" serial.
export const emulators = (devices) => devices.filter(({ serial }) => SERIAL.test(serial));

// `adb -s <serial> emu avd name`: the name, then "OK".
export function parseAvdName(text) {
  const [name, ...rest] = lines(text);
  return rest.at(-1) === 'OK' && AVD.test(name) ? name : undefined;
}

function json(text, key) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('simctl printed something that is not JSON');
  }
  if (data === null || typeof data !== 'object' || data[key] === null || typeof data[key] !== 'object') {
    throw new Error(`simctl output has no "${key}"`);
  }
  return data[key];
}

const iosLabel = (identifier) => {
  const [, platform, version] = RUNTIME.exec(identifier) ?? [];
  return platform === 'iOS' ? `iOS ${version.replaceAll('-', '.')}` : undefined;
};

// `simctl list devices available --json`: the iOS simulators (iPhone and iPad), each with a valid identifier.
export function parseSimulators(text) {
  return Object.entries(json(text, 'devices')).flatMap(([identifier, devices]) => {
    const runtime = iosLabel(identifier);
    if (runtime === undefined || !Array.isArray(devices)) return [];
    return devices.filter((d) => d && typeof d.name === 'string' && typeof d.udid === 'string' && UDID.test(d.udid) && d.isAvailable !== false)
      .map((d) => ({ name: d.name, udid: d.udid.toUpperCase(), runtime, state: /^[A-Za-z ]{1,20}$/.test(d.state) ? d.state : 'Unknown' }));
  });
}

// `simctl list runtimes --json`: the labels of the available iOS runtimes.
export function parseRuntimes(text) {
  return json(text, 'runtimes').flatMap((r) => (r && typeof r.identifier === 'string' && r.isAvailable !== false ? [iosLabel(r.identifier)] : []))
    .filter(Boolean);
}

// The simulator a request names, by identifier or by exact name; an unknown or ambiguous request is an Error.
export function matchSimulator(sims, target) {
  if (UDID.test(target)) {
    return sims.find((s) => s.udid === target.toUpperCase()) ?? fail(`no available simulator has the identifier ${clean(target)}`);
  }
  const named = sims.filter((s) => s.name === target);
  if (named.length === 1) return named[0];
  if (named.length === 0) fail(`no available simulator is named "${clean(target)}"; list them with: node .scripts/device.mjs list --platform ios`);
  const shown = named.slice(0, 8).map((s) => `${s.udid} (${s.runtime})`).join(', ');
  return fail(`"${clean(target)}" names several simulators; use one identifier: ${shown}${named.length > 8 ? `, and ${named.length - 8} more` : ''}`);
}

function fail(message) {
  throw new Error(message);
}

// The emulator name a request holds, or an Error that lists the real ones.
export function matchAvd(names, target) {
  return names.includes(target) ? target : fail(`no emulator is named "${clean(target)}"; available: ${names.join(', ') || 'none'}`);
}
