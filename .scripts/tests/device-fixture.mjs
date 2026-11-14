// A fake Android SDK for the device launcher tests: shell scripts under .temp/ that record each call with the path they
// were started from, and answer from files, so that the launcher runs for real against stand-ins. The launcher runs from
// a copy in a folder of its own, next to the SDK and the JDK and not inside it, because the launcher refuses any binary
// inside its own folder and the system temporary folder, which the fixture points at another empty folder.

import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, run } from './support.mjs';

export const SKIP = process.platform === 'win32' && 'the fake SDK binaries are POSIX shell scripts';

// Emulators in `running` ({ serial: name }) are up; `avds` are the names emulator -list-avds prints. When `autostart` is
// set, starting the fake emulator makes emulator-5556 appear, first as `offline` and from the next `adb devices` on as
// `device`, which is how a cold boot is simulated. Like a real adb, the fake answers the name through the boot property
// ro.boot.qemu.avd_name (ro.kernel.qemu.avd_name when `oldImage` is set) and answers `emu avd name` with nothing.
export function fixture(t, { avds = [], running = {}, autostart = false, devices = '', emulatorExit = 0, oldImage = false } = {}) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.temp', 'device-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  const sdk = join(dir, 'sdk');
  const launcher = join(dir, 'launcher');
  mkdirSync(join(launcher, '.scripts'), { recursive: true });
  mkdirSync(join(dir, 'tmp'));
  for (const name of readdirSync(join(ROOT, '.scripts')).filter((file) => /^device.*\.mjs$/.test(file))) {
    cpSync(join(ROOT, '.scripts', name), join(launcher, '.scripts', name));
  }
  const log = join(dir, 'calls.log');
  const data = join(dir, 'data');
  mkdirSync(join(data, 'names'), { recursive: true });
  writeFileSync(join(data, 'avds.txt'), `INFO    | notice\n${avds.join('\n')}\n`);
  writeFileSync(join(data, 'devices.txt'), devices + Object.keys(running).map((serial) => `${serial}\tdevice\n`).join(''));
  for (const [serial, name] of Object.entries(running)) writeFileSync(join(data, 'names', serial), `${name}\n`);
  if (autostart) writeFileSync(join(data, 'autostart'), '');
  if (oldImage) writeFileSync(join(data, 'oldimage'), '');
  const script = (folder, name, body) => {
    mkdirSync(join(sdk, folder), { recursive: true });
    const file = join(sdk, folder, name);
    writeFileSync(file, `#!/bin/sh\necho "$0 $*" >> "${log}"\nD="${data}"\n${body}\n`);
    chmodSync(file, 0o755);
    return file;
  };
  script('platform-tools', 'adb', `case "$1" in
  devices) echo "List of devices attached"
    cat "$D/devices.txt"
    if grep -q offline "$D/devices.txt"; then awk -F'\\t' -v OFS='\\t' '$2=="offline"{$2="device"} {print}' "$D/devices.txt" > "$D/devices.tmp"; mv "$D/devices.tmp" "$D/devices.txt"; fi;;
  -s) s="$2"; shift 2
    case "$*" in
      "emu avd name") ;;
      "shell getprop ro.boot.qemu.avd_name") [ -f "$D/oldimage" ] || { [ -f "$D/names/$s" ] && cat "$D/names/$s"; };;
      "shell getprop ro.kernel.qemu.avd_name") [ -f "$D/oldimage" ] && [ -f "$D/names/$s" ] && cat "$D/names/$s";;
      "emu kill") echo "OK: killing emulator, bye bye";;
      "shell getprop sys.boot_completed") echo 1;;
    esac;;
esac
exit 0`);
  script('emulator', 'emulator', `if [ "$1" = "-list-avds" ]; then cat "$D/avds.txt"; exit 0; fi
if [ "$1" = "-avd" ] && [ -f "$D/autostart" ]; then echo "$2" > "$D/names/emulator-5556"; printf 'emulator-5556\\toffline\\n' >> "$D/devices.txt"; fi
exit ${emulatorExit}`);
  // The first run of a new executable can take over a second where the system scans it, which a short --timeout would
  // count; run each once now and forget the call.
  for (const file of [join(sdk, 'platform-tools', 'adb'), join(sdk, 'emulator', 'emulator')]) run(file, ['-warm-up'], { timeout: 30000 });
  rmSync(log, { force: true });
  mkdirSync(join(dir, 'jdk', 'bin'), { recursive: true });
  const java = join(dir, 'jdk', 'bin', 'java');
  writeFileSync(java, '#!/bin/sh\necho \'openjdk version "21.0.1"\' >&2\n');
  chmodSync(java, 0o755);
  const device = (args, env = {}) => run(process.execPath, [join(launcher, '.scripts', 'device.mjs'), ...args], { cwd: dir,
    env: { PATH: process.env.PATH, HOME: dir, TMPDIR: join(dir, 'tmp'), ANDROID_HOME: sdk, JAVA_HOME: join(dir, 'jdk'), ...env } });
  device.sdk = sdk;
  device.dir = dir;
  device.launcher = launcher;
  device.calls = () => { try { return readFileSync(log, 'utf8').trim().split('\n'); } catch { return []; } };
  return device;
}
