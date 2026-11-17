// The turn-end pass of check-file-length.mjs on a stop some Stop hook already continued: it still blocks, but its own
// brake, kept per session and turn under .temp/check-file-length/, bounds how often, and its continuation carries a
// token that no turn-start pass mistakes for a new turn.

import assert from 'node:assert/strict';
import { existsSync, linkSync, lstatSync, mkdirSync, readdirSync, readFileSync, symlinkSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, hookFor, makeRepo, numbered, runClientHook } from './support.mjs';

const TOKEN = '[check-file-length:continuation]';
const FOLDER = ['.temp', 'check-file-length'];
const WEEK_AGO = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

const age = (path, date) => utimesSync(path, date, date);

// A repository whose session started its turn a minute ago, with stop(extra) running the turn-end pass.
function session(t, id = 's1') {
  const repo = makeRepo(t);
  const input = (extra) => JSON.stringify({ session_id: id, ...extra });
  const marker = join(repo.dir, ...FOLDER, id);
  const start = (extra = {}) => {
    assert.equal(repo.script('check-file-length.mjs', ['--hook', '--turn-start'], input(extra)).status, 0);
    age(marker, new Date(Date.now() - 60_000));
  };
  start();
  return { repo, start, marker, stop: (extra = { stop_hook_active: true }) => repo.script('check-file-length.mjs', ['--hook'], input(extra)) };
}

for (const client of ['claude', 'codex']) {
  test(`${client}: a stop a Stop hook already continued blocks on a new file over the limit, once per set of files`, (t) => {
    const { repo } = session(t, `session-${client}`);
    const hook = hookFor(client, 'Stop', 'check-file-length.mjs');
    const stop = () => runClientHook(client, hook, repo, { input: { session_id: `session-${client}`, stop_hook_active: true } });
    assert.equal(stop().status, 0);
    repo.write('big.go', numbered(151));
    const first = stop();
    assert.equal(first.status, 2);
    assert.match(first.stderr, /big\.go \(151 lines, new\)/);
    const again = stop();
    assert.equal(again.status, 0);
    assert.equal(again.stderr, '');
  });
}

test('the brake lets a changing set block at most three times in a turn, and a new turn restarts it', (t) => {
  const { repo, start, stop } = session(t);
  for (const name of ['a.go', 'b.go', 'c.go']) {
    repo.write(name, numbered(151));
    assert.equal(stop().status, 2, name);
  }
  repo.write('d.go', numbered(151));
  const spent = stop();
  assert.equal(spent.status, 0);
  assert.equal(spent.stderr, '');
  start();
  repo.write('d.go', numbered(151));
  assert.equal(stop().status, 2);
  assert.equal(stop().status, 0);
});

test('without a session id a stop already continued goes through, and one not continued still blocks every time', (t) => {
  const repo = makeRepo(t);
  repo.write('big.go', numbered(151));
  assert.equal(repo.script('check-file-length.mjs', ['--hook'], JSON.stringify({ stop_hook_active: true })).status, 0);
  for (let i = 0; i < 2; i++) assert.equal(repo.script('check-file-length.mjs', ['--hook'], JSON.stringify({ stop_hook_active: false })).status, 2);
});

test('the stop reason ends with the continuation token, the edit warning does not carry it, and a clean stop is silent', (t) => {
  const { repo, stop } = session(t);
  const quiet = stop();
  assert.equal(quiet.status, 0);
  assert.equal(quiet.stdout + quiet.stderr, '');
  repo.write('big.go', numbered(151));
  assert.ok(stop({ stop_hook_active: false }).stderr.trimEnd().endsWith(TOKEN));
  const edit = repo.script('check-file-length.mjs', ['--hook'], JSON.stringify({ tool_input: { file_path: 'big.go' } }));
  assert.equal(edit.status, 2);
  assert.match(edit.stderr, /big\.go \(151 lines, new\)/);
  assert.doesNotMatch(edit.stderr, /continuation/);
});

test('the brake keeps one small state file per session that the idle sweep of the markers removes', (t) => {
  const { repo, start, stop } = session(t);
  repo.write('big.go', numbered(151));
  assert.equal(stop().status, 2);
  const folder = join(repo.dir, ...FOLDER);
  const state = join(folder, 's1.stop');
  assert.ok(lstatSync(state).isFile());
  assert.equal(readFileSync(state, 'utf8').split('\n')[0], readFileSync(join(folder, 's1'), 'utf8'));
  // Another session's state, idle for a week, goes with the sweep; a file that is not state-shaped, or not idle, stays.
  repo.write('.temp/check-file-length/s2.stop', `${Date.now()}\n0123456789abcdef`);
  repo.write('.temp/check-file-length/s3.stop', `${Date.now()}\n0123456789abcdef`);
  repo.write('.temp/check-file-length/s4.stop', 'precious\n');
  repo.write('.temp/check-file-length/s5.stop', `${Date.now()}\n0123456789abcdef`);
  for (const name of ['s2.stop', 's4.stop', 's5.stop']) age(join(folder, name), WEEK_AGO);
  start();
  assert.deepEqual(readdirSync(folder).sort(), ['s1', 's1.stop', 's3.stop', 's4.stop']);
});

test('a marker folder that is a link keeps the brake from storing anything through it', { skip: WINDOWS }, (t) => {
  const repo = makeRepo(t);
  mkdirSync(join(repo.dir, 'victims'));
  mkdirSync(join(repo.dir, '.temp'), { recursive: true });
  symlinkSync(join(repo.dir, 'victims'), join(repo.dir, ...FOLDER), 'dir');
  repo.write('big.go', numbered(151));
  const input = (active) => JSON.stringify({ session_id: 's1', stop_hook_active: active });
  assert.equal(repo.script('check-file-length.mjs', ['--hook'], input(true)).status, 0);
  assert.equal(repo.script('check-file-length.mjs', ['--hook'], input(false)).status, 2);
  assert.deepEqual(readdirSync(join(repo.dir, 'victims')), []);
});

test('a state file that has another hard link is never written through, and the stop falls back as for a failed save', { skip: WINDOWS }, (t) => {
  const { repo, stop } = session(t);
  repo.write('victim.txt', 'precious\n');
  try {
    linkSync(join(repo.dir, 'victim.txt'), join(repo.dir, ...FOLDER, 's1.stop'));
  } catch (error) {
    return t.skip(`hard links are not available here (${error.code})`);
  }
  repo.write('big.go', numbered(151));
  assert.equal(stop().status, 0, 'a stop already continued goes through');
  assert.equal(stop({ stop_hook_active: false }).status, 2, 'a stop not continued still blocks');
  assert.equal(readFileSync(join(repo.dir, 'victim.txt'), 'utf8'), 'precious\n');
});

test('a turn-start prompt that carries either continuation token keeps the marker, wherever the client puts it', (t) => {
  const { repo, start } = session(t);
  const marker = join(repo.dir, ...FOLDER, 's1');
  const original = '1700000000000';
  repo.write('.temp/check-file-length/s1', original);
  for (const prompt of [`Stop hook feedback: fix it. ${TOKEN}`, `note\n[check-plan-stop:continuation]`, `${TOKEN} and more`]) {
    start({ prompt });
    assert.equal(readFileSync(marker, 'utf8'), original, prompt);
  }
  start({ prompt: 'a normal prompt' });
  assert.notEqual(readFileSync(marker, 'utf8'), original);
  assert.ok(existsSync(marker));
});
