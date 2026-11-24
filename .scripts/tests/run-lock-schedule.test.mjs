import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { EXPIRY_MS, acquire } from '../run-lock.mjs';
import { guardOf } from '../run-lock-reclaim.mjs';
import { schedule } from './run-lock-schedule.mjs';
import { ROOT } from './support.mjs';

const ACTORS = 3;
const STORE = pathToFileURL(join(ROOT, '.scripts', 'run-lock-store.mjs')).href;
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
// Seeds that made the guard of the previous design give two holders, with one dead guard; then plain expired locks and
// locks with two dead guards.
const PINNED = [8, 42, 95, 141, 148, 318, 371];
const CASES = [...PINNED.map((seed) => ({ seed, dead: 1 })), ...range(1, 20).map((seed) => ({ seed, dead: 0 })), ...range(21, 40).map((seed) => ({ seed, dead: 2 }))];
const old = (path) => utimesSync(path, new Date(Date.now() - EXPIRY_MS - 1000), new Date(Date.now() - EXPIRY_MS - 1000));

// An expired lock held by nobody and the guards of `dead` recoveries that died.
function expired(dir, dead) {
  rmSync(dir, { recursive: true, force: true });
  const file = join(dir, 'e2e.json');
  acquire('e2e', { dir, command: 'dead' });
  old(file);
  const { token } = JSON.parse(readFileSync(file, 'utf8'));
  for (const level of range(1, dead)) {
    writeFileSync(guardOf(file, token, level), '');
    old(guardOf(file, token, level));
  }
}

test('no interleaving of the changes of three processes that recover an expired lock gives two holders or leaves a file', async (t) => {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const base = mkdtempSync(join(ROOT, '.temp', 'run-lock-schedule-'));
  t.after(() => rmSync(base, { recursive: true, force: true, maxRetries: 5 }));
  const dir = join(base, 'run-locks');
  for (const [index, { seed, dead }] of CASES.entries()) {
    expired(dir, dead);
    const { results, trace } = await schedule({ store: STORE, dir, ctl: join(base, `ctl-${index}`), actors: ACTORS, seed });
    const message = `seed ${seed}, ${dead} dead guards: ${trace.join(' ')}`;
    assert.equal(results.filter((result) => result?.ok).length, 1, `${message}: ${JSON.stringify(results)}`);
    assert.deepEqual(readdirSync(dir), ['e2e.json'], message);
  }
});
