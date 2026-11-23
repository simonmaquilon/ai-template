// The lock files behind run-lock.mjs, for runs that must exclude each other: .temp/run-locks/<name>.json at the
// repository root holds the pid, start and command of the holder, and its modification time is the heartbeat the holder
// renews. A lock whose last beat is older than EXPIRY_MS is expired, whoever wrote it, so no process or port is ever
// inspected, which a sandbox can blank. Creation is exclusive, so only one acquirer wins, and the lock file is never
// renamed: an expired one is removed by the acquirer that holds the guard <name>.reclaim, created exclusively, which
// looks at the file again inside the guard and removes it only if it is still expired. A guard older than GUARD_MS was
// left by a dead process and is removed by whoever finds it, which can race with another remover only then. A process
// suspended for longer than EXPIRY_MS can lose its lock to another, and a removal still races narrowly with a renewal;
// both are why the expiry is several beats.

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BEAT_MS = 5000;
export const EXPIRY_MS = 6 * BEAT_MS;
const GUARD_MS = BEAT_MS;
const ATTEMPTS = 100;
const WAIT_MS = 5;
export const LOCK_DIR = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), '.temp', 'run-locks');
const NAME = /^[a-z0-9-]+$/;

function fileOf(name, dir) {
  if (!NAME.test(name)) throw new Error(`run-lock: the name ${JSON.stringify(name)} must match [a-z0-9-]+`);
  return join(dir, `${name}.json`);
}

const recordOf = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
};

// { name, state: 'free' | 'busy' | 'expired', pid, started, command, ageMs }, reading only.
export function inspect(name, { dir = LOCK_DIR } = {}) {
  const file = fileOf(name, dir);
  let stats;
  try {
    stats = statSync(file);
  } catch {
    return { name, state: 'free' };
  }
  const ageMs = Date.now() - stats.mtimeMs;
  const { pid, started, command } = recordOf(file);
  return { name, state: ageMs > EXPIRY_MS ? 'expired' : 'busy', pid, started, command, ageMs };
}

// The names of the locks that have a file, sorted.
export function locks({ dir = LOCK_DIR } = {}) {
  try {
    return readdirSync(dir).filter((entry) => entry.endsWith('.json') && NAME.test(entry.slice(0, -5))).map((entry) => entry.slice(0, -5)).sort();
  } catch {
    return [];
  }
}

const ageOf = (file) => Date.now() - statSync(file).mtimeMs;
const pause = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, WAIT_MS);

// Removes an expired lock file while holding the reclaim guard; true when this process held the guard, and false when
// another did, or left one that is not yet old enough to be dead.
function reclaim(file) {
  const guard = `${file.slice(0, -'.json'.length)}.reclaim`;
  try {
    writeFileSync(guard, '', { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    try {
      if (ageOf(guard) > GUARD_MS) unlinkSync(guard);
    } catch {
      // The holder just released it.
    }
    return false;
  }
  try {
    if (ageOf(file) > EXPIRY_MS) unlinkSync(file);
  } catch {
    // Already gone.
  }
  try {
    unlinkSync(guard);
  } catch {
    // Taken as dead by another process.
  }
  return true;
}

// { ok: true, lock } when this process now holds the lock, or { ok: false, holder } naming the live holder.
export function acquire(name, { dir = LOCK_DIR, command = '' } = {}) {
  const file = fileOf(name, dir);
  mkdirSync(dir, { recursive: true });
  const lock = { name, file, token: randomUUID() };
  const body = JSON.stringify({ pid: process.pid, started: new Date().toISOString(), command, token: lock.token });
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      writeFileSync(file, body, { flag: 'wx' });
      return { ok: true, lock };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const held = inspect(name, { dir });
    if (held.state === 'busy') return { ok: false, holder: held };
    if (held.state === 'expired' && !reclaim(file)) pause();
  }
  return { ok: false, holder: inspect(name, { dir }) };
}

const owns = (lock) => recordOf(lock.file).token === lock.token;

// Removes the lock file when it is still this holder's; safe to call twice.
export function release(lock) {
  try {
    if (owns(lock)) unlinkSync(lock.file);
  } catch {
    // Already gone.
  }
}

// Renews the heartbeat every `ms` while the lock is still this holder's; when the file no longer carries its token it
// stops and calls onLost once. Returns the function that stops it.
export function keepAlive(lock, ms = BEAT_MS, onLost = () => {}) {
  const timer = setInterval(() => {
    let held = false;
    try {
      held = owns(lock);
      if (held) utimesSync(lock.file, new Date(), new Date());
    } catch {
      held = false;
    }
    if (!held) {
      clearInterval(timer);
      onLost();
    }
  }, ms);
  timer.unref();
  return () => clearInterval(timer);
}
