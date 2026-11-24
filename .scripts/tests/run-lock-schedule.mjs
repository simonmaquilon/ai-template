// Runs several processes that acquire the same lock one step at a time: each one stops before every change it makes to
// the lock folder (run-lock-schedule-child.mjs), and a seeded generator picks which stopped one goes on, so that every
// seed is one interleaving of the changes, and the same one each time. Only one process moves at a time.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHILD = join(dirname(fileURLToPath(import.meta.url)), 'run-lock-schedule-child.mjs');
const LIMIT_MS = 30000;

// mulberry32: a small seeded generator returning numbers in [0, 1).
function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function start(id, env) {
  const child = spawn(process.execPath, [CHILD], { env: { ...process.env, ...env, ID: String(id) }, stdio: ['ignore', 'pipe', 'inherit'] });
  const actor = { id, child, state: 'running', steps: 0, label: '', result: null };
  let buffered = '';
  child.stdout.on('data', (chunk) => {
    buffered += chunk;
    for (let end = buffered.indexOf('\n'); end >= 0; end = buffered.indexOf('\n')) {
      const line = buffered.slice(0, end);
      buffered = buffered.slice(end + 1);
      if (line.startsWith('pause ')) Object.assign(actor, { state: 'paused', label: line.slice(6) });
      else actor.result = JSON.parse(line);
    }
  });
  child.on('close', () => { actor.state = 'done'; });
  return actor;
}

// { results, trace }: what each process's acquisition answered, and the order of changes that led there.
export async function schedule({ store, dir, ctl, actors: count, seed }) {
  mkdirSync(ctl, { recursive: true });
  const next = generator(seed);
  const actors = Array.from({ length: count }, (_, id) => start(id, { STORE: store, DIR: dir, CTL: ctl }));
  const trace = [];
  const deadline = Date.now() + LIMIT_MS;
  try {
    for (;;) {
      while (actors.some(({ state }) => state === 'running')) {
        if (Date.now() > deadline) throw new Error(`seed ${seed} did not settle: ${trace.join(' ')} ${JSON.stringify(actors.map(({ id, state, steps, label, result }) => ({ id, state, steps, label, result })))}`);
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      const paused = actors.filter(({ state }) => state === 'paused');
      if (paused.length === 0) return { results: actors.map(({ result }) => result), trace };
      const pick = paused[Math.floor(next() * paused.length)];
      trace.push(`${pick.id}:${pick.label}`);
      pick.state = 'running';
      writeFileSync(join(ctl, `${pick.id}-${++pick.steps}.go`), '');
    }
  } finally {
    for (const { child } of actors) child.kill('SIGKILL');
  }
}
