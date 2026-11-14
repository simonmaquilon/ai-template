import assert from 'node:assert/strict';
import test from 'node:test';
import { childEnv, exec, launch, must } from '../device-run.mjs';

const wait = async (done) => {
  for (let i = 0; i < 100 && !done(); i++) await new Promise((resolve) => setTimeout(resolve, 50));
};

test('device drops the variables that make a tool load other code', () => {
  const env = childEnv({ PATH: 'p', DEVELOPER_DIR: 'd', JAVA_TOOL_OPTIONS: 'j', _JAVA_OPTIONS: 'j', JDK_JAVA_OPTIONS: 'j', ANDROID_EMULATOR_LAUNCHER_DIR: 'a', HOME: 'h' });
  assert.deepEqual(env, { PATH: 'p', HOME: 'h' });
});

test('device runs a binary with an argument array and never through a shell', () => {
  const result = exec(process.execPath, ['-e', 'console.log(process.argv[1])', '$(id); echo x | cat']);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '$(id); echo x | cat');
});

test('device reports a binary that does not exist, that fails, or that runs out of time', () => {
  assert.match(exec(`${process.execPath}-missing`, []).error.code, /ENOENT/);
  assert.throws(() => must(exec(`${process.execPath}-missing`, []), 'tool'), /^Error: tool did not run \(ENOENT\)$/);
  assert.throws(() => must(exec(process.execPath, ['-e', 'console.error("bad\\u001b[31m thing\\nmore"); process.exit(4)']), 'tool'), /^Error: tool exited with 4: bad\?\[31m thing$/);
  assert.throws(() => must(exec(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { timeout: 100 }), 'tool'), /^Error: tool timed out$/);
  assert.equal(must(exec(process.execPath, ['-e', 'console.log("out")']), 'tool').trim(), 'out');
});

test('device notices a detached binary that does not start', async () => {
  const child = launch(`${process.execPath}-missing`, []);
  await wait(() => child.problem());
  assert.match(child.problem(), /^did not start \(ENOENT\)$/);
});

test('device notices a detached binary that ends with an error, and lets a clean exit pass', async () => {
  const failing = launch(process.execPath, ['-e', 'process.exit(3)']);
  await wait(() => failing.problem());
  assert.equal(failing.problem(), 'ended with 3');
  const clean = launch(process.execPath, ['-e', '0']);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(clean.problem(), undefined);
});
