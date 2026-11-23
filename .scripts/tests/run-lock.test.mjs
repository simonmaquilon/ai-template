import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { BEAT_MS, EXPIRY_MS, acquire, commandLine, inspect, keepAlive, release } from '../run-lock.mjs';
import { ROOT } from './support.mjs';

// A lock folder of its own under .temp/, removed afterwards.
function lockDir(t) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.temp', 'run-lock-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  return join(dir, 'run-locks');
}
const age = (file, ms) => utimesSync(file, new Date(Date.now() - ms), new Date(Date.now() - ms));

test('acquire writes the lock file with pid, start and command, and release removes it', (t) => {
  const dir = lockDir(t);
  const result = acquire('e2e', { dir, command: 'pnpm run test:e2e' });
  assert.equal(result.ok, true);
  const record = JSON.parse(readFileSync(join(dir, 'e2e.json'), 'utf8'));
  assert.equal(record.pid, process.pid);
  assert.equal(record.command, 'pnpm run test:e2e');
  assert.ok(!Number.isNaN(Date.parse(record.started)));
  assert.equal(inspect('e2e', { dir }).state, 'busy');
  release(result.lock);
  assert.equal(existsSync(join(dir, 'e2e.json')), false);
  assert.equal(inspect('e2e', { dir }).state, 'free');
  release(result.lock);
});

test('a second acquisition of a live lock fails and names the holder', (t) => {
  const dir = lockDir(t);
  const first = acquire('e2e', { dir, command: 'one' });
  const second = acquire('e2e', { dir, command: 'two' });
  assert.equal(second.ok, false);
  assert.equal(second.holder.command, 'one');
  assert.equal(second.holder.pid, process.pid);
  assert.equal(acquire('other', { dir }).ok, true);
  release(first.lock);
  assert.equal(acquire('e2e', { dir, command: 'two' }).ok, true);
});

test('an expired lock is replaced, and releasing the old holder does not remove the new lock', (t) => {
  const dir = lockDir(t);
  const old = acquire('e2e', { dir, command: 'old' });
  age(join(dir, 'e2e.json'), EXPIRY_MS + 1000);
  assert.equal(inspect('e2e', { dir }).state, 'expired');
  const fresh = acquire('e2e', { dir, command: 'new' });
  assert.equal(fresh.ok, true);
  release(old.lock);
  assert.equal(JSON.parse(readFileSync(join(dir, 'e2e.json'), 'utf8')).command, 'new');
  release(fresh.lock);
});

test('a lock only just inside the limit is still alive, and the limit is several heartbeats', (t) => {
  const dir = lockDir(t);
  assert.ok(EXPIRY_MS >= 3 * BEAT_MS);
  acquire('e2e', { dir });
  age(join(dir, 'e2e.json'), EXPIRY_MS - 5000);
  assert.equal(acquire('e2e', { dir }).ok, false);
});

test('the heartbeat renews the modification time of the lock file', async (t) => {
  const dir = lockDir(t);
  const { lock } = acquire('e2e', { dir });
  age(join(dir, 'e2e.json'), EXPIRY_MS + 1000);
  const stop = keepAlive(lock, 10);
  t.after(stop);
  const deadline = Date.now() + 5000;
  while (inspect('e2e', { dir }).state !== 'busy' && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(inspect('e2e', { dir }).state, 'busy');
  stop();
  release(lock);
});

test('a reclaim guard left by a dead process expires, and a fresh one holds the recovery back', (t) => {
  const dir = lockDir(t);
  acquire('e2e', { dir, command: 'dead' });
  age(join(dir, 'e2e.json'), EXPIRY_MS + 1000);
  writeFileSync(join(dir, 'e2e.reclaim'), '');
  assert.equal(acquire('e2e', { dir }).ok, false);
  age(join(dir, 'e2e.reclaim'), EXPIRY_MS + 1000);
  assert.equal(acquire('e2e', { dir }).ok, true);
  assert.deepEqual(readdirSync(dir), ['e2e.json']);
});

test('the heartbeat reports once that the file no longer carries its token', async (t) => {
  const dir = lockDir(t);
  const { lock } = acquire('e2e', { dir });
  writeFileSync(join(dir, 'e2e.json'), JSON.stringify({ token: 'someone-else' }));
  let lost = 0;
  const stop = keepAlive(lock, 10, () => lost++);
  t.after(stop);
  const deadline = Date.now() + 5000;
  while (lost === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(lost, 1);
});

test('a name outside [a-z0-9-]+ is refused, and a damaged lock file counts as expired', (t) => {
  const dir = lockDir(t);
  for (const name of ['', 'A', 'a b', '../x', 'a_b', 'a.json']) assert.throws(() => acquire(name, { dir }), /name/, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'broken.json'), 'not json');
  age(join(dir, 'broken.json'), EXPIRY_MS + 1000);
  assert.equal(inspect('broken', { dir }).state, 'expired');
  assert.equal(acquire('broken', { dir }).ok, true);
});

test('commandLine leaves a POSIX command alone and runs a Windows .cmd through cmd.exe without a shell string of the arguments', () => {
  assert.deepEqual(commandLine('pnpm', ['run', 'x y'], { platform: 'linux' }), { file: 'pnpm', args: ['run', 'x y'] });
  const exists = (path) => path === 'C:\\bin\\pnpm.cmd';
  const env = { PATH: 'C:\\nope;C:\\bin', PATHEXT: '.COM;.EXE;.CMD', ComSpec: 'C:\\Windows\\System32\\cmd.exe' };
  const line = commandLine('pnpm', ['run', 'a b', 'c&d'], { platform: 'win32', env, exists });
  assert.equal(line.file, 'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(line.args.slice(0, 4), ['/d', '/s', '/v:off', '/c']);
  assert.equal(line.args[4], '""C:\\bin\\pnpm.cmd" run "a b" "c&d""');
  assert.equal(line.verbatim, true);
  assert.throws(() => commandLine('pnpm', ['say "x"'], { platform: 'win32', env, exists }), /unsupported/);
  assert.throws(() => commandLine('pnpm', ['say %PATH%'], { platform: 'win32', env, exists }), /unsupported/);
  const percent = { ...env, PATH: 'C:\\100%\\bin' };
  assert.throws(() => commandLine('pnpm', [], { platform: 'win32', env: percent, exists: (path) => path === 'C:\\100%\\bin\\pnpm.cmd' }), /unsupported path/);
  assert.deepEqual(commandLine('node', [], { platform: 'win32', env: percent, exists: (path) => path === 'C:\\100%\\bin\\node.exe' }), { file: 'node', args: [] });
  assert.deepEqual(commandLine('node', ['-v'], { platform: 'win32', env, exists: () => false }), { file: 'node', args: ['-v'] });
});
