import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { acquire } from '../run-lock.mjs';
import { scratch } from './scratch-fixture.mjs';
import { WINDOWS } from './support.mjs';

const BUSY = 75;
const lockScratch = (t) => scratch(t, ['run-lock.mjs', 'run-lock-store.mjs', 'run-lock-reclaim.mjs', 'run-lock-command.mjs']);
// The repository's own lock folder, which the copied script reads, and a command that runs the Node of this process.
const folder = (repo) => join(repo.dir, '.temp', 'run-locks');
const wrap = (repo, name, ...child) => repo.script('run-lock.mjs', [name, '--', process.execPath, ...child]);
const stamp = (repo, name) => join(repo.dir, 'marker-' + name);
const touch = (repo, name) => ['-e', `require('fs').writeFileSync(${JSON.stringify(stamp(repo, name))}, 'ran')`];

test('the wrapper runs the command, passes its output and exit code through and releases the lock', (t) => {
  const repo = lockScratch(t);
  const ok = wrap(repo, 'e2e', '-e', 'console.log("hello"); console.error("oops")');
  assert.deepEqual([ok.status, ok.stdout.trim(), ok.stderr.trim()], [0, 'hello', 'oops']);
  assert.deepEqual(readdirSync(folder(repo)), []);
  const failed = wrap(repo, 'e2e', '-e', 'process.exit(3)');
  assert.equal(failed.status, 3);
  assert.deepEqual(readdirSync(folder(repo)), []);
  const thrown = wrap(repo, 'e2e', '-e', 'throw new Error("x")');
  assert.equal(thrown.status, 1);
  assert.deepEqual(readdirSync(folder(repo)), []);
});

test('a live lock stops the wrapper before it runs anything, with a line naming the holder', (t) => {
  const repo = lockScratch(t);
  assert.equal(acquire('e2e', { dir: folder(repo), command: 'pnpm run test:e2e' }).ok, true);
  const result = wrap(repo, 'e2e', ...touch(repo, 'blocked'));
  assert.equal(result.status, BUSY);
  assert.equal(existsSync(stamp(repo, 'blocked')), false);
  assert.match(result.stderr, /e2e/);
  assert.match(result.stderr, /pnpm run test:e2e/);
  assert.match(result.stderr, new RegExp(`pid ${process.pid}\\b`));
  assert.equal(result.stderr.trim().split('\n').length, 1);
});

test('an expired lock is recovered by the wrapper', (t) => {
  const repo = lockScratch(t);
  acquire('e2e', { dir: folder(repo), command: 'dead' });
  const old = new Date(Date.now() - 3600 * 1000);
  utimesSync(join(folder(repo), 'e2e.json'), old, old);
  assert.equal(wrap(repo, 'e2e', ...touch(repo, 'recovered')).status, 0);
  assert.equal(existsSync(stamp(repo, 'recovered')), true);
});

test('a bad name, a missing command or a command that does not exist is a usage error that leaves no lock', (t) => {
  const repo = lockScratch(t);
  assert.equal(repo.script('run-lock.mjs', ['Bad_Name', '--', process.execPath, '-v']).status, 64);
  assert.equal(repo.script('run-lock.mjs', ['e2e']).status, 64);
  assert.equal(repo.script('run-lock.mjs', ['e2e', '--']).status, 64);
  const missing = repo.script('run-lock.mjs', ['e2e', '--', 'no-such-command-for-run-lock']);
  assert.notEqual(missing.status, 0);
  assert.ok(!existsSync(folder(repo)) || readdirSync(folder(repo)).length === 0);
});

test('status reads only: free and expired exit 0, busy exits 1, one line per lock', (t) => {
  const repo = lockScratch(t);
  const status = (...args) => repo.script('run-lock.mjs', ['status', ...args]);
  const none = status('e2e');
  assert.deepEqual([none.status, none.stdout.trim()], [0, 'e2e: free']);
  assert.equal(status().status, 0);
  acquire('e2e', { dir: folder(repo), command: 'pnpm run test:e2e' });
  acquire('seed', { dir: folder(repo), command: 'old' });
  const old = new Date(Date.now() - 3600 * 1000);
  utimesSync(join(folder(repo), 'seed.json'), old, old);
  const busy = status('e2e');
  assert.equal(busy.status, 1);
  assert.match(busy.stdout, /^e2e: busy pid \d+, /);
  const expired = status('seed');
  assert.equal(expired.status, 0);
  assert.match(expired.stdout, /^seed: expired pid \d+, /);
  const all = status();
  assert.equal(all.status, 1);
  assert.deepEqual(all.stdout.trim().split('\n').map((line) => line.split(':')[0]).sort(), ['e2e', 'seed']);
  assert.equal(readdirSync(folder(repo)).length, 2);
});

// Windows ends a process on SIGTERM without running its handlers, so the forwarding cannot be observed there.
for (const signal of ['SIGTERM', 'SIGHUP']) {
  test(`${signal} to the wrapper reaches the child and the lock is released`, { skip: WINDOWS }, async (t) => {
    const repo = lockScratch(t);
    const child = spawn(process.execPath, [join(repo.dir, '.scripts', 'run-lock.mjs'), 'e2e', '--', process.execPath, '-e',
      `process.on("${signal}", () => process.exit(7)); setInterval(() => {}, 1000); console.log("up")`], { cwd: repo.dir, stdio: ['ignore', 'pipe', 'inherit'] });
    t.after(() => child.kill('SIGKILL'));
    await new Promise((resolve) => child.stdout.once('data', resolve));
    assert.equal(readdirSync(folder(repo)).length, 1);
    const exit = new Promise((resolve) => child.once('exit', (code, name) => resolve({ code, signal: name })));
    child.kill(signal);
    assert.deepEqual(await exit, { code: 7, signal: null });
    assert.deepEqual(readdirSync(folder(repo)), []);
  });
}

// The only place where the path through cmd.exe of run-lock-command.mjs runs for real: Node refuses to start a .cmd file itself.
test('on Windows a .cmd file runs through the wrapper with its arguments, and its exit code comes out', { skip: WINDOWS ? false : 'needs cmd.exe, which only Windows has' }, (t) => {
  const repo = lockScratch(t);
  const file = join(repo.dir, 'show args.cmd');
  writeFileSync(file, '@echo off\r\necho first=%1 second=%2 third=%3\r\nexit /b 7\r\n');
  const result = repo.script('run-lock.mjs', ['e2e', '--', file, 'one', 'two words', 'a&b']);
  assert.equal(result.status, 7, result.stderr);
  assert.equal(result.stdout.trim(), 'first=one second="two words" third="a&b"');
  assert.deepEqual(readdirSync(folder(repo)), []);
});

test('the wrapper warns on stderr when its lock file stops carrying its token, and leaves the other run alone', (t) => {
  const repo = lockScratch(t);
  const file = join(folder(repo), 'e2e.json');
  const replace = `require('fs').writeFileSync(${JSON.stringify(file)}, '{"token":"another"}'); setTimeout(() => {}, 6500)`;
  const result = wrap(repo, 'e2e', '-e', replace);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /run-lock: .*e2e.* no longer/);
  assert.equal(readFileSync(file, 'utf8'), '{"token":"another"}');
});
