// The requirement checks of `device.mjs doctor`: one row per requirement with "ok", "missing" or, for iOS outside
// macOS, "unavailable", and how to fix a missing one. It only looks and runs the tools with a version or status query;
// it installs nothing. java is found only in JAVA_HOME or on an absolute PATH entry (device-sdk.mjs) and only run with -version.

import { isAbsolute } from 'node:path';
import { clean, parseRuntimes } from './device-parse.mjs';
import { XCODE_SELECT, XCRUN } from './device-ios.mjs';
import { defaultRoots, findSdk, javaBinary, sdkFiles } from './device-sdk.mjs';
import { must } from './device-run.mjs';

const row = (ok, name, detail) => ({ status: ok ? 'ok' : 'missing', name, detail });
const SDK_FIX = 'set ANDROID_HOME (or ANDROID_SDK_ROOT) to an absolute Android SDK folder that holds platform-tools/adb and emulator/emulator as regular files, not symbolic links, outside the repository and the temporary folder';

function java(env, os, run, roots) {
  const fix = 'install a JDK, then set JAVA_HOME to its folder or put java on an absolute PATH entry';
  const { file, problem } = javaBinary(env, os, roots);
  if (file === undefined) return row(false, 'android/java', `${problem}; ${fix}`);
  const result = run(file, ['-version'], { timeout: 15000 });
  try {
    must(result, 'java -version');
  } catch (error) {
    return row(false, 'android/java', `${error.message}; ${fix}`);
  }
  return row(true, 'android/java', clean(result.stderr.trim().split('\n')[0] || result.stdout.trim().split('\n')[0], 100));
}

function android(env, os, run, roots) {
  const sdk = findSdk(env, os, roots);
  const sdkRow = (name) => {
    const [dir, file] = sdkFiles(os)[name];
    const missing = sdk.problem ?? (sdk.home ? `no regular file ${dir}/${file} under ${clean(sdk.home)}` : 'ANDROID_HOME and ANDROID_SDK_ROOT are unset');
    return sdk[name] ? row(true, `android/sdk ${name}`, clean(sdk[name])) : row(false, `android/sdk ${name}`, `${missing}; ${SDK_FIX}`);
  };
  return [java(env, os, run, roots), sdkRow('adb'), sdkRow('emulator')];
}

function ios(os, run) {
  if (os !== 'darwin') return [{ status: 'unavailable', name: 'ios', detail: 'simulators exist only on macOS' }];
  const rows = [];
  try {
    const path = must(run(XCODE_SELECT, ['-p']), 'xcode-select -p').trim();
    rows.push(isAbsolute(path) ? row(true, 'ios/xcode', clean(path)) : row(false, 'ios/xcode', 'xcode-select printed no path'));
  } catch (error) {
    rows.push(row(false, 'ios/xcode', `${error.message}; install Xcode and select it with xcode-select -s <path to Xcode.app/Contents/Developer>`));
  }
  try {
    const runtimes = parseRuntimes(must(run(XCRUN, ['simctl', 'list', 'runtimes', '--json']), 'simctl list runtimes'));
    rows.push(runtimes.length > 0 ? row(true, 'ios/runtime', runtimes.join(', '))
      : row(false, 'ios/runtime', 'no iOS simulator runtime; download one from Xcode (Settings, Components)'));
  } catch (error) {
    rows.push(row(false, 'ios/runtime', `${error.message}; install Xcode and an iOS simulator runtime`));
  }
  return rows;
}

// { rows, ok }: ok when the requested platform, or at least one without a request, has every requirement.
export function doctor({ platform, env, os = process.platform, run, roots = defaultRoots() }) {
  const groups = { android: platform === 'ios' ? [] : android(env, os, run, roots), ios: platform === 'android' ? [] : ios(os, run) };
  const done = (rows) => rows.length > 0 && rows.every((r) => r.status === 'ok');
  const rows = [{ status: 'ok', name: 'node', detail: `${process.version} (informational)` }, ...groups.android, ...groups.ios];
  return { rows, ok: done(groups.android) || done(groups.ios) };
}
