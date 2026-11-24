import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import test from 'node:test';
import { EXPIRY_MS, acquire, release } from '../run-lock.mjs';
import { guardOf } from '../run-lock-reclaim.mjs';
import { ROOT } from './support.mjs';

// A lock folder of its own under .temp/, removed afterwards, and an expired lock held by nobody in it.
function expiredLock(t, content) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const base = mkdtempSync(join(ROOT, '.temp', 'run-lock-guard-'));
  t.after(() => rmSync(base, { recursive: true, force: true, maxRetries: 5 }));
  const dir = join(base, 'run-locks');
  const file = join(dir, 'e2e.json');
  if (content === undefined) acquire('e2e', { dir, command: 'dead' });
  else {
    mkdirSync(dir);
    writeFileSync(file, content);
  }
  age(file, EXPIRY_MS + 1000);
  return { dir, file };
}
const age = (path, ms) => utimesSync(path, new Date(Date.now() - ms), new Date(Date.now() - ms));
const tokenOf = (file) => JSON.parse(readFileSync(file, 'utf8')).token;

test('a recovery under way blocks the others, and the guard of one that died stops blocking once it is old', (t) => {
  const { dir, file } = expiredLock(t);
  const token = tokenOf(file);
  const guard = guardOf(file, token, 1);
  writeFileSync(guard, '');
  const blocked = acquire('e2e', { dir, command: 'blocked' });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.holder.state, 'expired');
  assert.equal(tokenOf(file), token);
  assert.deepEqual(readdirSync(dir).sort(), [basename(guard), 'e2e.json']);
  age(guard, EXPIRY_MS);
  const taken = acquire('e2e', { dir, command: 'taken' });
  assert.equal(taken.ok, true);
  assert.deepEqual(readdirSync(dir), ['e2e.json']);
  release(taken.lock);
});

test('a recovery sweeps the old guards of locks that no longer exist, and keeps a young one', (t) => {
  const { dir, file } = expiredLock(t);
  const [gone, goneToo, young] = [randomUUID(), randomUUID(), randomUUID()];
  for (const token of [gone, goneToo, young]) writeFileSync(guardOf(file, token, 1), '');
  for (const token of [gone, goneToo]) age(guardOf(file, token, 1), EXPIRY_MS);
  assert.equal(acquire('e2e', { dir, command: 'taken' }).ok, true);
  assert.deepEqual(readdirSync(dir).sort(), [basename(guardOf(file, young, 1)), 'e2e.json']);
});

test('an expired lock file without a readable token, or with one that is no token, is recovered without touching other paths', (t) => {
  for (const content of ['', '{"pid":1', '{"token":"../../escape"}', '{"token":{}}']) {
    const { dir } = expiredLock(t, content);
    assert.equal(acquire('e2e', { dir, command: 'taken' }).ok, true, JSON.stringify(content));
    assert.deepEqual(readdirSync(dir), ['e2e.json'], JSON.stringify(content));
    assert.deepEqual(readdirSync(join(dir, '..')), ['run-locks'], JSON.stringify(content));
  }
});
