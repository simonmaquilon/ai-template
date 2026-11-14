// What `device.mjs list` collects and prints. A platform that cannot be read is reported as unavailable, with the
// reason, instead of failing the whole listing; the platform readers are thunks that throw when it cannot.

import * as android from './device-android.mjs';
import * as ios from './device-ios.mjs';
import { clean } from './device-parse.mjs';

function section(read) {
  try {
    return { available: true, ...read() };
  } catch (error) {
    return { available: false, reason: clean(error.message, 500) };
  }
}

// { android?, ios? } for the platforms asked for; androidContext() gives the adb and emulator paths and iosRun() the runner.
export function collect(platform, { androidContext, iosRun }) {
  const result = {};
  if (platform !== 'ios') result.android = section(() => ({ emulators: android.list(androidContext()) }));
  if (platform !== 'android') {
    result.ios = section(() => ({ simulators: ios.simulators(iosRun()).map((sim) => ({ ...sim, name: clean(sim.name) })) }));
  }
  return result;
}

export const anyAvailable = (result) => Object.values(result).some((part) => part.available);

// The lines of the text form: a header per platform, then one tab-separated line per device.
export function lines(result) {
  return Object.entries(result).flatMap(([name, part]) => {
    if (!part.available) return [`${name}: unavailable (${part.reason})`];
    const items = part.emulators?.map((e) => [e.name, e.serial ? 'running' : 'stopped', e.serial ?? ''])
      ?? part.simulators.map((s) => [s.name, s.udid, s.runtime, s.state]);
    return [name, ...(items.length > 0 ? items : [['(none)']]).map((item) => `  ${item.join('\t').trimEnd()}`)];
  });
}
