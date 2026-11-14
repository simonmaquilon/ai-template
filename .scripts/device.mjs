#!/usr/bin/env node
// Checks the requirements for, lists, starts and stops Android emulators and iOS simulators that already exist, from the
// repository root, without creating or deleting any, installing images or starting an Appium server:
//   node .scripts/device.mjs doctor [--platform android|ios]
//   node .scripts/device.mjs list [--platform android|ios] [--json]
//   node .scripts/device.mjs boot android <avd> [--headless] [--timeout <seconds>]
//   node .scripts/device.mjs boot ios <udid|name> [--timeout <seconds>]
//   node .scripts/device.mjs shutdown android <serial|avd>   |   shutdown ios <udid|name>
// A project exempts it from the client sandbox on its own authorization, because a simulator or an emulator cannot start
// in it (.readme/90-agent-skills.md, "Lanzador de dispositivos móviles"). The template ships no exemption.
//
// Guaranteed: a command or option outside the closed list, a name outside its pattern or a --timeout outside 1-900
// leaves with status 1 before any binary is looked for; a name or identifier reaches a binary only after it matches a
// real device from the tool's own list; no shell ever runs, every binary is an absolute path (adb and emulator inside
// the SDK folder, as regular files and not links; xcrun and xcode-select in /usr/bin; java only for -version, from
// JAVA_HOME or an absolute PATH entry), and none of those folders may lie, links resolved, inside the folder that holds
// .scripts/ or the system temporary folder, where a confined command can write a binary; what the tools print is
// sanitized before it reaches the terminal; it reads no project file and writes none; shutdown reaches only emulators
// (serial emulator-<port>), never a physical device; --timeout bounds the whole boot, each tool getting what is left.
// Not guaranteed: whoever controls the environment of this process controls ANDROID_HOME, ANDROID_SDK_ROOT, JAVA_HOME,
// PATH, TMPDIR and the rest of what the tools read (only DEVELOPER_DIR, the JVM option variables and
// ANDROID_EMULATOR_LAUNCHER_DIR are dropped); other folders a confined command can write are not known; the SDK and
// system binaries are trusted as they are, with no signature or permission check; an emulator it starts is detached,
// so it outlives this process and its own output is discarded; shutdown asks an emulator to stop and does not wait;
// `adb devices` starts the adb server if it is not running, and that server runs unconfined and stays reachable on
// localhost:5037 afterwards.

import { parseArgs } from './device-args.mjs';
import * as android from './device-android.mjs';
import { doctor } from './device-doctor.mjs';
import * as ios from './device-ios.mjs';
import { anyAvailable, collect, lines } from './device-list.mjs';
import { clean } from './device-parse.mjs';
import { exec } from './device-run.mjs';
import { findSdk } from './device-sdk.mjs';

const TIMEOUTS = { android: 180, ios: 120 };
const MESSAGE = 1000;

function androidContext() {
  const sdk = findSdk(process.env);
  if (!sdk.adb || !sdk.emulator) throw new Error(`${sdk.problem ?? 'the Android SDK was not found'}; run: node .scripts/device.mjs doctor --platform android`);
  return { sdk, run: exec };
}

function iosRun() {
  if (process.platform !== 'darwin') throw new Error('iOS simulators exist only on macOS');
  return exec;
}

async function main(argv) {
  const request = parseArgs(argv);
  const { command, platform, target, timeout } = request;
  if (command === 'doctor') {
    const { rows, ok } = doctor({ platform, env: process.env, run: exec });
    for (const r of rows) console.log(`${r.status.padEnd(11)} ${r.name}: ${r.detail}`);
    process.exitCode = ok ? 0 : 1;
  } else if (command === 'list') {
    const result = collect(platform, { androidContext, iosRun });
    for (const line of request.json ? [JSON.stringify(result, null, 2)] : lines(result)) console.log(line);
    process.exitCode = anyAvailable(result) ? 0 : 1;
  } else if (platform === 'android') {
    const ctx = androidContext();
    console.log(command === 'boot' ? await android.boot(ctx, target, { headless: request.headless, timeout: timeout ?? TIMEOUTS.android })
      : android.shutdown(ctx, target));
  } else {
    const run = iosRun();
    console.log(command === 'boot' ? ios.boot(run, target, { timeout: timeout ?? TIMEOUTS.ios }) : ios.shutdown(run, target));
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(`device: ${clean(error.message, MESSAGE)}`);
  process.exitCode = 1;
});
