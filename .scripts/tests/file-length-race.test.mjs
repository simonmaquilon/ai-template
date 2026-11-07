// A sandboxed command can swap the marker folder for a link at any moment while the turn-start pass runs: the pass
// works inside the folder it verified, so a swap right before a call cannot redirect that call to another folder.

import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, makeRepo, run } from './support.mjs';

const WEEK_AGO =new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

function oldFile(repo, path, text) {
  repo.write(path, text);
  utimesSync(join(repo.dir, path), WEEK_AGO, WEEK_AGO);
}

// Runs the turn-start pass with `call` patched so that, the first time it runs once the marker folder exists, the
// folder is moved aside and a link to the victims takes its place, then the real call goes ahead.
function runSwapping(repo, call) {
  const dir = join(repo.dir, '.temp', 'check-file-length');
  repo.write('.temp/swap.mjs', `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const original = fs.${call};
let fired = false;
fs.${call} = (...args) => {
  if (!fired && fs.existsSync(${JSON.stringify(dir)})) {
    fired = true;
    fs.renameSync(${JSON.stringify(dir)}, ${JSON.stringify(join(repo.dir, '.temp', 'moved'))});
    fs.symlinkSync(${JSON.stringify(join(repo.dir, 'victims'))}, ${JSON.stringify(dir)}, 'dir');
  }
  return original(...args);
};
syncBuiltinESMExports();
await import('../.scripts/check-file-length.mjs');
`);
  const result = run(process.execPath, ['.temp/swap.mjs', '--hook', '--turn-start'], { cwd: repo.dir, input: JSON.stringify({ session_id: 's1' }) });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(lstatSync(dir).isSymbolicLink(), 'the swap ran');
}

test('a marker folder swapped for a link after the check loses nothing through it', { skip: WINDOWS }, (t) => {
  const repo = makeRepo(t);
  oldFile(repo, 'victims/victim.mjs', 'protected\n');
  oldFile(repo, 'victims/victim', 'protected\n');
  oldFile(repo, 'victims/12345', '1700000000000');
  runSwapping(repo, 'readdirSync');
  for (const name of ['victim.mjs', 'victim', '12345']) assert.ok(existsSync(join(repo.dir, 'victims', name)), name);
});

test('a marker folder swapped for a link after a marker was read loses nothing through it', { skip: WINDOWS }, (t) => {
  const repo = makeRepo(t);
  oldFile(repo, '.temp/check-file-length/12345', '1700000000000');
  oldFile(repo, 'victims/12345', 'protected\n');
  runSwapping(repo, 'unlinkSync');
  assert.equal(readFileSync(join(repo.dir, 'victims', '12345'), 'utf8'), 'protected\n');
  assert.equal(existsSync(join(repo.dir, '.temp', 'moved', '12345')), false);
});
