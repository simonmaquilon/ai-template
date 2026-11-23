import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { EXPIRY_MS, acquire } from '../run-lock.mjs';
import { ROOT } from './support.mjs';

const PROCESSES = 6;
const ROUNDS = 5;
const STORE = pathToFileURL(join(ROOT, '.scripts', 'run-lock-store.mjs')).href;
// Says ready, spins until the go file exists, tries the lock once and says whether it won, without ever releasing it.
const CHILD = `
  import { existsSync } from 'node:fs';
  const { acquire } = await import(process.env.STORE);
  console.log('ready');
  while (!existsSync(process.env.GO));
  console.log(JSON.stringify(acquire('e2e', { dir: process.env.DIR, command: String(process.pid) })));
`;

// Starts the processes, lets them all go at once and returns what each one's acquisition answered.
async function round(dir, go) {
  const env = { ...process.env, STORE, DIR: dir, GO: go };
  const children = Array.from({ length: PROCESSES }, () => spawn(process.execPath, ['--input-type=module', '-e', CHILD], { env, stdio: ['ignore', 'pipe', 'inherit'] }));
  let ready = 0;
  const results = children.map((child) => new Promise((resolve) => {
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.endsWith('ready\n') && ++ready === PROCESSES) writeFileSync(go, '');
    });
    child.on('close', () => resolve(JSON.parse(out.trim().split('\n').pop())));
  }));
  return Promise.all(results);
}

test('processes that acquire an expired lock at the same moment produce exactly one holder and no leftover file', async (t) => {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const base = mkdtempSync(join(ROOT, '.temp', 'run-lock-race-'));
  t.after(() => rmSync(base, { recursive: true, force: true, maxRetries: 5 }));
  const dir = join(base, 'run-locks');
  const go = join(base, 'go');
  acquire('e2e', { dir, command: 'dead' });
  for (let i = 0; i < ROUNDS; i++) {
    const old = new Date(Date.now() - EXPIRY_MS - 1000);
    utimesSync(join(dir, 'e2e.json'), old, old);
    rmSync(go, { force: true });
    const winners = (await round(dir, go)).filter(({ ok }) => ok);
    assert.equal(winners.length, 1, `round ${i}: ${winners.length} holders`);
    assert.deepEqual(readdirSync(dir), ['e2e.json'], `round ${i}`);
  }
});
