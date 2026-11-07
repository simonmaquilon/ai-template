// The turn-start pass writes in .temp/, which a sandboxed command can write too, while the hook runs outside the
// sandbox: following a symlink there would let that command make the hook delete or overwrite protected files.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, makeRepo, run } from './support.mjs';

const START =['--hook', '--turn-start'];
const INPUT = JSON.stringify({ session_id: 's1' });
const WEEK_AGO = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

function link(t, target, path, type) {
  try {
    symlinkSync(target, path, type);
    return true;
  } catch (error) {
    t.skip(`cannot create a link: ${error.code}`);
    return false;
  }
}

test('the turn-start pass does not clean up through a marker folder that is a link', (t) => {
  const repo = makeRepo(t);
  for (const name of ['victim.mjs', 'victim']) {
    repo.write(`victims/${name}`, 'protected\n');
    utimesSync(join(repo.dir, 'victims', name), WEEK_AGO, WEEK_AGO);
  }
  mkdirSync(join(repo.dir, '.temp'), { recursive: true });
  if (!link(t, join(repo.dir, 'victims'), join(repo.dir, '.temp', 'check-file-length'), WINDOWS ? 'junction' : 'dir')) return;
  const result = repo.script('check-file-length.mjs', START, INPUT);
  assert.equal(result.status, 0, result.stderr);
  for (const name of ['victim.mjs', 'victim']) assert.equal(readFileSync(join(repo.dir, 'victims', name), 'utf8'), 'protected\n', name);
  assert.equal(existsSync(join(repo.dir, 'victims', 's1')), false);
});

test('the turn-start pass leaves alone a file the session marker links to', (t) => {
  const repo = makeRepo(t);
  repo.write('protected.mjs', 'protected\n');
  mkdirSync(join(repo.dir, '.temp', 'check-file-length'), { recursive: true });
  if (!link(t, join(repo.dir, 'protected.mjs'), join(repo.dir, '.temp', 'check-file-length', 's1'))) return;
  const result = repo.script('check-file-length.mjs', START, INPUT);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(repo.dir, 'protected.mjs'), 'utf8'), 'protected\n');
});

test('the turn-start pass creates nothing where .temp is a link to another folder', (t) => {
  const repo = makeRepo(t);
  mkdirSync(join(repo.dir, 'outside'));
  if (!link(t, join(repo.dir, 'outside'), join(repo.dir, '.temp'), WINDOWS ? 'junction' : 'dir')) return;
  const result = repo.script('check-file-length.mjs', START, INPUT);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(join(repo.dir, 'outside')), []);
});

// A named pipe as the marker would block a plain open until something reads it, and the hook has no timeout.
test('the turn-start pass returns promptly when the session marker is a named pipe', { skip: WINDOWS }, (t) => {
  const repo = makeRepo(t);
  mkdirSync(join(repo.dir, '.temp', 'check-file-length'), { recursive: true });
  if (run('mkfifo', [join(repo.dir, '.temp', 'check-file-length', 's1')]).status !== 0) return t.skip('mkfifo is unavailable');
  const result = run(process.execPath, [join('.scripts', 'check-file-length.mjs'), ...START], { cwd: repo.dir, input: INPUT, timeout: 5000 });
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stderr);
});
