// A tree with more folders of ignored files than one command line can name, which prompt-plan's record before reads
// in groups, and a folder with more ignored files than one call can take as arguments: each record is taken, and its
// untracked list names each ignored file.

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

test('prompt-plan many folders: record before names every ignored file of 20000 folders that hold only ignored files', { timeout: 300000 }, (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'logs/README': 'logs\n', '.gitignore': '.temp/\n*.log\n' });
  // Some 1.3 MB of pathspecs, past what macOS and Windows take on one command line.
  const names = Array.from({ length: 20000 }, (_, i) => `run-${String(i).padStart(5, '0')}-${'x'.repeat(48)}`);
  for (const name of names) {
    mkdirSync(join(repo.dir, 'logs', name));
    writeFileSync(join(repo.dir, 'logs', name, 'a.log'), 'log\n');
  }
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  const listed = new Set(JSON.parse(gunzipSync(readFileSync(join(plan, 'patch', '01.untracked'))).toString('utf8')));
  assert.equal(names.filter((name) => !listed.has(`logs/${name}/a.log`)).length, 0);
});

test('prompt-plan many folders: record before names every ignored file of a folder that holds 160000 of them', { timeout: 600000 }, (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', '.gitignore': '.temp/\n*.log\n' });
  mkdirSync(join(repo.dir, 'data'));
  for (let i = 0; i < 160000; i += 1) writeFileSync(join(repo.dir, 'data', `${i}.log`), '');
  const { plan, patch } = patchPlan(repo, ['01']);
  const before = patch('record', '01', 'before');
  ok(before);
  assert.doesNotMatch(before.stderr, /^\s+at /m, 'the record carries a stack trace');
  const listed = JSON.parse(gunzipSync(readFileSync(join(plan, 'patch', '01.untracked'))).toString('utf8'));
  assert.equal(listed.filter((name) => name.startsWith('data/')).length, 160000);
});
