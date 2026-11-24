import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { EXPIRY_MS, acquire } from '../run-lock.mjs';
import { guardOf } from '../run-lock-reclaim.mjs';
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

const age = (path) => utimesSync(path, new Date(Date.now() - EXPIRY_MS - 1000), new Date(Date.now() - EXPIRY_MS - 1000));

// Every round expires the lock the last one gave, leaves `dead` guards of recoveries that died, and lets the processes go.
async function races(t, dead) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const base = mkdtempSync(join(ROOT, '.temp', 'run-lock-race-'));
  t.after(() => rmSync(base, { recursive: true, force: true, maxRetries: 5 }));
  const dir = join(base, 'run-locks');
  const file = join(dir, 'e2e.json');
  const go = join(base, 'go');
  acquire('e2e', { dir, command: 'dead' });
  for (let i = 0; i < ROUNDS; i++) {
    age(file);
    const { token } = JSON.parse(readFileSync(file, 'utf8'));
    for (let level = 1; level <= dead; level++) {
      writeFileSync(guardOf(file, token, level), '');
      age(guardOf(file, token, level));
    }
    rmSync(go, { force: true });
    const winners = (await round(dir, go)).filter(({ ok }) => ok);
    assert.equal(winners.length, 1, `round ${i}: ${winners.length} holders`);
    assert.deepEqual(readdirSync(dir), ['e2e.json'], `round ${i}`);
  }
}

test('processes that acquire an expired lock at the same moment produce exactly one holder and no leftover file', (t) => races(t, 0));

test('processes that recover an expired lock over guards left by dead recoveries produce exactly one holder and no leftover file', (t) => races(t, 2));
