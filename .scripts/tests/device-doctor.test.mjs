import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { doctor } from '../device-doctor.mjs';
import { sdkFiles } from '../device-sdk.mjs';
import { ROOT } from './support.mjs';

// The tests pass os 'linux', so the fake files carry the names the doctor looks for on that system. They live under
// .temp/ and are not refused only because each test passes its own `roots`.
function sdk(t) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const dir = realpathSync(mkdtempSync(join(ROOT, '.temp', 'device-doctor-')));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  for (const [folder, name] of [...Object.values(sdkFiles('linux')), ['jdk/bin', 'java']]) {
    mkdirSync(join(dir, folder), { recursive: true });
    writeFileSync(join(dir, folder, name), '', { mode: 0o755 });
    chmodSync(join(dir, folder, name), 0o755);
  }
  return { dir, java: join(dir, 'jdk', 'bin', 'java') };
}

const JAVA = { status: 0, stdout: '', stderr: 'openjdk version "21.0.1" 2026-01-01\nOpenJDK Runtime Environment\n' };
const ENOENT = () => ({ status: null, stdout: '', stderr: '', error: Object.assign(new Error('x'), { code: 'ENOENT' }) });

test('doctor passes android when java and both SDK binaries are there', (t) => {
  const { dir, java } = sdk(t);
  const calls = [];
  const run = (file, args, options) => { calls.push([file, args, options]); return JAVA; };
  const { rows, ok } = doctor({ platform: 'android', env: { ANDROID_HOME: dir, JAVA_HOME: join(dir, 'jdk') }, os: 'linux', run, roots: [] });
  assert.equal(ok, true);
  assert.deepEqual(rows.map((r) => [r.status, r.name]), [['ok', 'node'], ['ok', 'android/java'], ['ok', 'android/sdk adb'], ['ok', 'android/sdk emulator']]);
  assert.equal(rows[1].detail, 'openjdk version "21.0.1" 2026-01-01');
  assert.equal(rows[2].detail, join(dir, 'platform-tools', 'adb'));
  assert.deepEqual(calls, [[java, ['-version'], { timeout: 15000 }]], 'only java -version ran, by its absolute path');
});

test('doctor takes java from an absolute PATH entry when JAVA_HOME is unset, never from the roots', (t) => {
  const { dir, java } = sdk(t);
  const calls = [];
  const run = (file) => { calls.push(file); return JAVA; };
  const env = { PATH: `relative${process.platform === 'win32' ? ';' : ':'}${join(dir, 'jdk', 'bin')}` };
  assert.equal(doctor({ platform: 'android', env, os: 'linux', run, roots: [] }).rows[1].status, 'ok');
  assert.deepEqual(calls, [java]);
  const refused = doctor({ platform: 'android', env, os: 'linux', run, roots: [dir] });
  assert.equal(calls.length, 1, 'a java inside the roots ran nothing');
  assert.match(refused.rows[1].detail, /^no java on an absolute PATH entry outside the repository/);
});

test('doctor says how to fix each missing android requirement, and fails', () => {
  const { rows, ok } = doctor({ platform: 'android', env: { JAVA_HOME: 'jdk' }, os: 'linux', run: ENOENT, roots: [] });
  assert.equal(ok, false);
  assert.deepEqual(rows.slice(1).map((r) => r.status), ['missing', 'missing', 'missing']);
  assert.match(rows[1].detail, /JAVA_HOME is not an absolute path; install a JDK, then set JAVA_HOME/);
  assert.match(rows[2].detail, /ANDROID_HOME and ANDROID_SDK_ROOT are unset; set ANDROID_HOME \(or ANDROID_SDK_ROOT\)/);
  assert.match(rows[2].detail, /outside the repository and the temporary folder/);
});

test('doctor says why an SDK or java folder inside the roots was refused', (t) => {
  const { dir } = sdk(t);
  const { rows } = doctor({ platform: 'android', env: { ANDROID_HOME: dir, JAVA_HOME: join(dir, 'jdk') }, os: 'linux', run: () => JAVA, roots: [dir] });
  assert.deepEqual(rows.slice(1).map((r) => r.status), ['missing', 'missing', 'missing']);
  assert.ok(rows.slice(1).every((r) => /inside the repository or the temporary folder/.test(r.detail)));
});

test('doctor reports java that fails to run', (t) => {
  const { dir } = sdk(t);
  const { rows } = doctor({ platform: 'android', env: { JAVA_HOME: join(dir, 'jdk') }, os: 'linux', run: ENOENT, roots: [] });
  assert.match(rows[1].detail, /java -version did not run \(ENOENT\); install a JDK/);
});

test('doctor without a platform passes when one platform does, and the other is only listed', (t) => {
  const { dir } = sdk(t);
  const run = (file) => (file.endsWith('java') ? JAVA : { status: 1, stdout: '', stderr: 'no' });
  const env = { ANDROID_HOME: dir, JAVA_HOME: join(dir, 'jdk') };
  const result = doctor({ env, os: 'linux', run, roots: [] });
  assert.equal(result.ok, true);
  assert.equal(result.rows.at(-1).status, 'unavailable');
  assert.equal(doctor({ platform: 'ios', env, os: 'linux', run, roots: [] }).ok, false);
});

test('doctor sanitizes what java prints and the SDK path it shows', (t) => {
  const { dir } = sdk(t);
  const run = () => ({ status: 0, stdout: '', stderr: 'version \u001b[31m"1"‮\n' });
  const { rows } = doctor({ platform: 'android', env: { ANDROID_HOME: dir, JAVA_HOME: join(dir, 'jdk') }, os: 'linux', run, roots: [] });
  assert.equal(rows[1].detail, 'version ?[31m"1"?');
  assert.equal(rows[2].detail, rows[2].detail.replace(/[\u0000-\u001f‮]/g, ''));
});
