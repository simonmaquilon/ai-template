import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { findSdk, javaBinary, sdkFiles } from '../device-sdk.mjs';
import { ROOT, WINDOWS } from './support.mjs';

const NO_LINKS = { skip: WINDOWS && 'creating symbolic links needs a privilege on Windows' };

// A folder under .temp/ with an SDK and a JDK; tests pass `roots` so that the folder itself is not refused.
function folder(t) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const dir = realpathSync(mkdtempSync(join(ROOT, '.temp', 'device-sdk-')));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  const files = sdkFiles();
  const java = process.platform === 'win32' ? 'java.exe' : 'java';
  for (const [parent, name] of [...Object.values(files), ['sdk-jdk/bin', java]]) {
    mkdirSync(join(dir, parent), { recursive: true });
    writeFileSync(join(dir, parent, name), '', { mode: 0o755 });
  }
  return { dir, files, java };
}

test('device finds the SDK binaries only inside an absolute folder', (t) => {
  const { dir, files } = folder(t);
  const os = process.platform;
  assert.deepEqual(findSdk({ ANDROID_HOME: dir }, os, []), { home: dir, adb: join(dir, ...files.adb), emulator: join(dir, ...files.emulator) });
  assert.equal(findSdk({ ANDROID_SDK_ROOT: dir }, os, []).adb, join(dir, ...files.adb));
  assert.equal(findSdk({ ANDROID_HOME: join(dir, 'missing'), ANDROID_SDK_ROOT: dir }, os, []).emulator, join(dir, ...files.emulator));
  assert.match(findSdk({ ANDROID_HOME: 'relative/sdk' }, os, []).problem, /not an absolute path/);
  assert.match(findSdk({ ANDROID_HOME: join(dir, 'missing') }, os, []).problem, /not an existing folder/);
  assert.deepEqual(findSdk({}, os, []), {});
  assert.equal(findSdk({ ANDROID_HOME: `${dir}\0x` }, os, []).adb, undefined);
});

test('device refuses an SDK folder inside the repository or the temporary folder, links resolved', (t) => {
  const { dir } = folder(t);
  const refused = (value, roots) => findSdk({ ANDROID_HOME: value }, process.platform, roots);
  for (const roots of [[dir], [join(dir, '..')]]) {
    assert.equal(refused(dir, roots).adb, undefined);
    assert.match(refused(dir, roots).problem, /inside the repository or the temporary folder/);
  }
  assert.ok(refused(dir, [join(dir, 'other')]).adb, 'a sibling of the root is accepted');
  assert.ok(refused(dir, [`${dir}-x`]).adb, 'a folder whose name merely starts like the root is accepted');
});

test('device resolves a link to the SDK folder before it compares it with the roots', NO_LINKS, (t) => {
  const { dir } = folder(t);
  mkdirSync(join(dir, 'root'));
  symlinkSync(dir, join(dir, 'root', 'link'));
  assert.match(findSdk({ ANDROID_HOME: join(dir, 'root', 'link') }, process.platform, [dir]).problem, /inside the repository/);
  assert.ok(findSdk({ ANDROID_HOME: join(dir, 'root', 'link') }, process.platform, [join(dir, 'root')]).adb);
});

test('device refuses an SDK binary that is a symbolic link', NO_LINKS, (t) => {
  const { dir, files } = folder(t);
  const file = join(dir, ...files.adb);
  rmSync(file);
  symlinkSync(join(dir, ...files.emulator), file);
  const found = findSdk({ ANDROID_HOME: dir }, process.platform, []);
  assert.equal(found.adb, undefined);
  assert.equal(found.emulator, join(dir, ...files.emulator));
});

test('device takes java from JAVA_HOME, and refuses a relative, missing or repository folder', (t) => {
  const { dir, java } = folder(t);
  const os = process.platform;
  const home = join(dir, 'sdk-jdk');
  assert.deepEqual(javaBinary({ JAVA_HOME: home }, os, []), { file: join(home, 'bin', java) });
  assert.match(javaBinary({ JAVA_HOME: 'jdk' }, os, []).problem, /JAVA_HOME is not an absolute path/);
  assert.match(javaBinary({ JAVA_HOME: join(dir, 'none') }, os, []).problem, /not an existing folder/);
  assert.match(javaBinary({ JAVA_HOME: home }, os, [dir]).problem, /inside the repository/);
  assert.match(javaBinary({ JAVA_HOME: dir }, os, []).problem, /no regular file bin\//);
  assert.deepEqual(Object.keys(javaBinary({ JAVA_HOME: home, PATH: '' }, os, [])), ['file'], 'JAVA_HOME wins over PATH');
});

test('device looks for java only on absolute PATH entries outside the roots', (t) => {
  const { dir, java } = folder(t);
  const bin = join(dir, 'sdk-jdk', 'bin');
  const os = process.platform;
  const path = ['', 'relative', join(dir, 'empty'), bin].join(delimiter);
  assert.deepEqual(javaBinary({ PATH: path }, os, []), { file: join(bin, java) });
  assert.deepEqual(javaBinary({ PATH: path }, os, [dir]).problem, `no ${java} on an absolute PATH entry outside the repository and the temporary folder`);
  assert.match(javaBinary({ PATH: ['', 'relative'].join(delimiter) }, os, []).problem, /^no java/);
  assert.match(javaBinary({}, os, []).problem, /^no java/);
});
