import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, gone } from './mobile-server-fixture.mjs';

const failed = (mobile, env, reason) => {
  const result = mobile(['--check'], env);
  assert.equal(result.status, 1, result.stdout);
  assert.equal(result.stdout, '', 'a failed check prints nothing to stdout');
  assert.match(result.stderr, reason);
};

test('--check installs if needed, speaks MCP to the server, prints its name, version and tools, and stops it', (t) => {
  const mobile = fixture(t);
  const result = mobile(['--check']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'Fake Appium 9.8.7: 3 tools\n');
  assert.match(result.stderr, /installing appium-mcp@1\.2\.3/);
  assert.equal(mobile.npmCalls().length, 1);
  assert.equal(mobile(['--check']).stdout, 'Fake Appium 9.8.7: 3 tools\n');
  assert.equal(mobile.npmCalls().length, 1, 'the second check found the cache ready');
});

test('--check counts the tools of every page of the list', (t) => {
  assert.equal(fixture(t)(['--check'], { FAKE_PAGED: '1' }).stdout, 'Fake Appium 9.8.7: 5 tools\n');
});

test('--check ends the server it started', async (t) => {
  const mobile = fixture(t);
  const child = mobile.start(['--check']);
  const pid = Number((await child.waitFor(/ready (\d+)/))[1]);
  await new Promise((resolve) => child.on('close', resolve));
  assert.ok(await gone(pid), 'the server still runs');
});

test('--check fails, with nothing on stdout, when the server writes to stdout what is not the protocol', (t) => {
  failed(fixture(t), { FAKE_NOISE: '1' }, /appium-mcp failed its check: the server wrote to stdout something that is not JSON: this is not JSON/);
});

test('--check fails when the server exits before it answers', (t) => {
  failed(fixture(t), { FAKE_EXIT_AT_START: '2' }, /failed its check: the server exited \(2\) before the handshake ended/);
});

test('--check fails within its deadline when the server never answers, and stops it', async (t) => {
  const mobile = fixture(t);
  const child = mobile.start(['--check'], { FAKE_SILENT: '1', MOBILE_SERVER_CHECK_TIMEOUT_MS: '1500' });
  const pid = Number((await child.waitFor(/ready (\d+)/))[1]);
  await child.waitFor(/did not finish the handshake within 1500 ms/);
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(code, 1);
  assert.ok(await gone(pid), 'the server still runs');
});
