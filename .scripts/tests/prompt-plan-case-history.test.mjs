// A history that tracks one name in two spellings, such as inc/A.h and inc/a.h committed where names differ by case,
// checked out where the file system takes both for one file: the plan runs, since the snapshots it builds on or the
// last commit hold both spellings already, also when a commit between fragments brings the second one, and only a
// fragment that changes that file, or deletes one spelling, is refused, since no patch can replay the change, by after
// and by restore, also when the second spelling was committed during the fragment.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { patchPlan, run, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const DOUBLED = /files the index or its before snapshot holds in two spellings that this file system takes for one file, which apply, revert, and restore cannot replay[^\n]*:\n {2}inc\/(A|a)\.h/;

function ignoresCase(dir) {
  writeFileSync(join(dir, 'Probe'), '');
  const found = existsSync(join(dir, 'probe'));
  rmSync(join(dir, 'Probe'));
  return found;
}

test('prompt-plan case history: two spellings the history already tracks stay, and only a change to that file is refused', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'inc/a.h': 'header\n' });
  if (!ignoresCase(repo.dir)) {
    t.skip('this file system tells names apart by case');
    return;
  }
  const blob = run('git', ['hash-object', '-w', '--stdin'], { cwd: repo.dir, input: 'header\n' }).stdout.trim();
  ok(repo.git('update-index', '--add', '--cacheinfo', `100644,${blob},inc/A.h`));
  ok(repo.git('commit', '-q', '-m', 'both spellings'));
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '01', 'after'));
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8')).files), ['kept.txt']);
  ok(patch('revert', 'all'));
  ok(patch('apply', 'all'));
  ok(patch('record', '02', 'before'));
  repo.write('inc/a.h', 'changed\n');
  const refused = patch('record', '02', 'after');
  assert.equal(refused.status, 1, `${refused.stdout}${refused.stderr}`);
  assert.match(refused.stderr, DOUBLED);
  assert.equal(existsSync(join(plan, 'patch', '02.state')), false);
});

function twoSpellings(t) {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'inc/a.h': 'header\n' });
  if (!ignoresCase(repo.dir)) {
    t.skip('this file system tells names apart by case');
    return null;
  }
  const blob = run('git', ['hash-object', '-w', '--stdin'], { cwd: repo.dir, input: 'header\n' }).stdout.trim();
  return { repo, addSecond: () => ok(repo.git('update-index', '--add', '--cacheinfo', `100644,${blob},inc/A.h`)) };
}

test('prompt-plan case history: a fragment that deletes one of two spellings the history tracks is refused', (t) => {
  const started = twoSpellings(t);
  if (!started) return;
  const { repo, addSecond } = started;
  addSecond();
  ok(repo.git('commit', '-q', '-m', 'both spellings'));
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  ok(repo.git('rm', '-q', 'inc/A.h'));
  const refused = patch('record', '01', 'after');
  assert.equal(refused.status, 1, `${refused.stdout}${refused.stderr}`);
  assert.match(refused.stderr, DOUBLED);
  assert.equal(existsSync(join(plan, 'patch', '01.state')), false);
});

test('prompt-plan case history: a commit between fragments that brings a second spelling lets the next one start', (t) => {
  const started = twoSpellings(t);
  if (!started) return;
  const { repo, addSecond } = started;
  const { patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '01', 'after'));
  addSecond();
  ok(repo.git('commit', '-q', '-m', 'upstream adds inc/A.h'));
  ok(patch('record', '02', 'before'));
});

test('prompt-plan case history: restore refuses, before writing, a change to a file whose second spelling was committed during the fragment', (t) => {
  const started = twoSpellings(t);
  if (!started) return;
  const { repo, addSecond } = started;
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('inc/a.h', 'frag\n');
  addSecond();
  ok(repo.git('commit', '-q', '-m', 'second spelling'));
  const refused = patch('record', '01', 'restore');
  assert.equal(refused.status, 1, `${refused.stdout}${refused.stderr}`);
  assert.match(refused.stderr, DOUBLED);
  assert.equal(readFileSync(join(repo.dir, 'inc', 'a.h'), 'utf8'), 'frag\n');
});

test('prompt-plan case history: a second spelling staged between fragments that no snapshot or commit holds stops the next one until git rm --cached', (t) => {
  const started = twoSpellings(t);
  if (!started) return;
  const { repo, addSecond } = started;
  const { patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '01', 'after'));
  addSecond();
  const refused = patch('record', '02', 'before');
  assert.equal(refused.status, 1, `${refused.stdout}${refused.stderr}`);
  assert.match(refused.stderr, /the index holds these names in a second spelling that this file system takes for the same file, which fragment 01's after record and the last commit lack[^\n]*:\n {2}inc\/A\.h \(beside inc\/a\.h\)/);
  ok(repo.git('rm', '--cached', '-q', '--', 'inc/A.h'));
  ok(patch('record', '02', 'before'));
  assert.equal(readFileSync(join(repo.dir, 'inc', 'a.h'), 'utf8'), 'header\n');
});
