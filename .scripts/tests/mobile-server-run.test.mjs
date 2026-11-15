import assert from 'node:assert/strict';
import test from 'node:test';
import { alive, fixture, gone } from './mobile-server-fixture.mjs';
import { WINDOWS } from './support.mjs';

const closed = (child) => new Promise((resolve) => child.on('close', (code, signal) => resolve({ code, signal })));

test('mobile-server wires stdin, stdout and stderr to the server, and writes nothing of its own to stdout', (t) => {
  const mobile = fixture(t);
  for (let start = 0; start < 2; start++) {
    const result = mobile([], {}, 'first line\nsecond line\n');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'echo:first line\necho:second line\n');
    assert.match(result.stderr, /ready \d+/, 'the stderr of the server reaches stderr');
    assert.equal(/installing appium-mcp/.test(result.stderr), start === 0, 'its own notice, only when it installs, goes to stderr too');
  }
});

test('mobile-server exits with the status of the server', (t) => {
  const mobile = fixture(t);
  for (const code of [0, 3, 42]) assert.equal(mobile([], {}, `exit:${code}\n`).status, code);
});

test('mobile-server forwards SIGTERM to the server and exits with its status', { skip: WINDOWS && 'Windows has no POSIX signals to forward' }, async (t) => {
  const child = fixture(t).start();
  await child.waitFor(/ready \d+/);
  const end = closed(child);
  child.kill('SIGTERM');
  assert.deepEqual(await end, { code: 7, signal: null }, 'the server handled the SIGTERM it got and exited with 7');
  await child.waitFor(/got SIGTERM/);
});

test('the worker threads and the processes the server forks run without the guard of the launcher', async (t) => {
  const child = fixture(t).start([], { FAKE_SPAWN: '1' });
  await child.waitFor(/worker ok/);
  await child.waitFor(/fork ok/);
});

test('the server dies with the launcher, even when the launcher is killed and forwards nothing', async (t) => {
  const child = fixture(t).start();
  const pid = Number((await child.waitFor(/ready (\d+)/))[1]);
  assert.ok(alive(pid), 'the server runs while the launcher does');
  child.kill('SIGKILL');
  assert.ok(await gone(pid), 'the server stopped after its launcher was killed');
});
