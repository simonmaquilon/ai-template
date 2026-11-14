// The Android operations of device.mjs on emulators that already exist. Each takes ctx = { sdk, run }, where sdk holds
// the absolute adb and emulator paths and run(file, args, options) runs a binary, so a test can stand in for both.

import { AVD, SERIAL, clean, emulators, matchAvd, parseAdbDevices, parseAvdName, parseAvds } from './device-parse.mjs';
import { launch, must } from './device-run.mjs';

export const avds = ({ sdk, run }) => parseAvds(must(run(sdk.emulator, ['-list-avds']), 'emulator -list-avds'));

// The name an emulator was started from: its boot properties, which every image answers through the shell (the
// console command `emu avd name` answers nothing when the console token file is empty), and that command only as the
// last resort. A value counts only if it matches the AVD pattern.
function nameOf({ sdk, run }, serial) {
  for (const prop of ['ro.boot.qemu.avd_name', 'ro.kernel.qemu.avd_name']) {
    const result = run(sdk.adb, ['-s', serial, 'shell', 'getprop', prop]);
    const value = result.status === 0 ? result.stdout.trim() : '';
    if (AVD.test(value)) return value;
  }
  const named = run(sdk.adb, ['-s', serial, 'emu', 'avd', 'name']);
  return named.status === 0 ? parseAvdName(named.stdout) : undefined;
}

// The emulators adb sees, with the name each was started from; one that is still `offline` has none yet, which is not an
// error, and a physical device never appears.
export function running(ctx) {
  const devices = emulators(parseAdbDevices(must(ctx.run(ctx.sdk.adb, ['devices']), 'adb devices')));
  return devices.map(({ serial, state }) => ({ serial, state, avd: state === 'device' ? nameOf(ctx, serial) : undefined }));
}

export function list(ctx) {
  const up = running(ctx);
  return avds(ctx).map((name) => ({ name, serial: up.find((e) => e.avd === name)?.serial }));
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Starts the emulator detached and waits until adb sees it and sys.boot_completed is 1, all within `timeout` seconds:
// every adb call gets at most the time that is left. It never kills what it started.
export async function boot(ctx0, avd, { headless, timeout, start = launch, sleep = wait, now = Date.now }) {
  const deadline = now() + timeout * 1000;
  let spent = false; // the last call ran out of time because of the deadline, which is no adb error
  const ctx = { ...ctx0, run: (file, args, options = {}) => {
    const limit = Math.min(options.timeout ?? 30000, Math.max(deadline - now(), 1));
    const result = ctx0.run(file, args, { ...options, timeout: limit });
    spent = limit < (options.timeout ?? 30000) && result.error?.code === 'ETIMEDOUT';
    return result;
  } };
  matchAvd(avds(ctx), avd);
  const before = running(ctx).find((e) => e.avd === avd);
  if (before) return `${avd} is already running as ${before.serial} (${before.state})`;
  const child = start(ctx.sdk.emulator, ['-avd', avd, ...(headless ? ['-no-window', '-no-audio'] : [])]);
  let last;
  for (;;) {
    if (child.problem()) throw new Error(`the emulator process ${child.problem()} before ${avd} was ready; start it by hand to see why`);
    try {
      const up = running(ctx).find((e) => e.avd === avd);
      const ready = up && ctx.run(ctx.sdk.adb, ['-s', up.serial, 'shell', 'getprop', 'sys.boot_completed']).stdout.trim() === '1';
      if (ready) return `${avd} booted as ${up.serial}`;
    } catch (error) {
      if (!spent) last = error.message; // adb may restart its server while the emulator starts
    }
    if (now() >= deadline) throw new Error(`${avd} was not ready after ${timeout} s${last ? ` (last adb error: ${last})` : ''}; it may still be starting, check with: list --platform android`);
    await sleep(1000);
  }
}

// Asks one running emulator to stop, by serial or name, and does not wait for it; an emulator that exists but is not
// running is reported as such. A physical device has no "emulator-<port>" serial and no name here, so it is never reached.
export function shutdown(ctx, target) {
  const up = running(ctx);
  const byName = !SERIAL.test(target);
  const matches = up.filter((e) => (byName ? e.avd === target : e.serial === target));
  if (matches.length === 0 && byName) {
    matchAvd(avds(ctx), target);
    return `${target} is not running`;
  }
  if (matches.length !== 1) {
    const known = up.map((e) => `${e.serial}${e.avd ? ` (${e.avd})` : ''}`).join(', ') || 'none';
    throw new Error(`${matches.length === 0 ? 'no running emulator matches' : 'several running emulators match'} "${clean(target)}"; running emulators: ${known}`);
  }
  must(ctx.run(ctx.sdk.adb, ['-s', matches[0].serial, 'emu', 'kill']), 'adb emu kill');
  return `shutdown requested for ${matches[0].serial}`;
}
