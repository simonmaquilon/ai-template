// The order and record guards of prompt-plan's patch scripts: a recorded fragment is never recorded again, and neither is
// one whose later fragments have records; no fragment starts while an earlier one is open or reverted; apply and revert
// refuse while any fragment is open; a record they cannot read, a state or an untracked list, is refused by name; none
// of it ends in a stack trace; a git older than 2.25 is refused before anything else runs.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { WINDOWS, patchPlan, run, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const refused = (result, pattern) => {
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, pattern);
  assert.doesNotMatch(result.stderr, /^\s+at /m, 'the refusal carries a stack trace');
};
const read = (plan, name) => readFileSync(join(plan, 'patch', name), 'utf8');

test('prompt-plan guards: a recorded fragment is never recorded again, and its records stay', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '01', 'after'));
  const recorded = read(plan, '01.state');
  refused(patch('record', '01', 'before'), /already recorded/);
  refused(patch('record', '01', 'restore'), /already recorded/);
  assert.deepEqual(['01.before', '01.untracked'].map((name) => existsSync(join(plan, 'patch', name))), [false, false]);
  assert.equal(read(plan, '01.state'), recorded);
  ok(patch('revert', '01'));
  refused(patch('record', '01', 'before'), /already recorded/);
});

test('prompt-plan guards: a fragment whose later fragments have records keeps its own', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '01', 'after'));
  ok(patch('record', '02', 'before'));
  const recorded = read(plan, '01.state');
  refused(patch('record', '01', 'before'), /02/);
  repo.write('other.txt', 'other\n');
  ok(patch('record', '02', 'after', '--include', 'other.txt'));
  refused(patch('record', '01', 'restore'), /02/);
  assert.equal(read(plan, '01.state'), recorded);
});

test('prompt-plan guards: no fragment starts while an earlier one is still open', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  refused(patch('record', '02', 'before'), /01/);
  assert.equal(existsSync(join(plan, 'patch', '02.before')), false);
  ok(patch('record', '01', 'after'));
  ok(patch('record', '02', 'before'));
});

test('prompt-plan guards: no fragment starts while an earlier recorded one is reverted', (t) => {
  const repo = startRepo(t);
  const { patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '01', 'after'));
  ok(patch('revert', 'all'));
  refused(patch('record', '02', 'before'), /apply[\s\S]*01/);
  ok(patch('apply', 'all'));
  ok(patch('record', '02', 'before'));
});

test('prompt-plan guards: apply and revert refuse while a fragment is open, and change no file', (t) => {
  const repo = startRepo(t);
  const { patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'one\n');
  ok(patch('record', '01', 'after'));
  ok(patch('record', '02', 'before'));
  repo.write('kept.txt', 'two\n');
  for (const args of [['apply', '01'], ['apply', 'all'], ['revert', '01'], ['revert', 'all']]) {
    refused(patch(...args), /fragment 02[\s\S]*before record[\s\S]*no after record/);
    assert.equal(readFileSync(join(repo.dir, 'kept.txt'), 'utf8'), 'two\n', `${args.join(' ')} wrote`);
  }
  ok(patch('record', '02', 'after'));
  ok(patch('revert', 'all'));
  assert.equal(readFileSync(join(repo.dir, 'kept.txt'), 'utf8'), 'before\n');
});

test('prompt-plan guards: a record that is not valid JSON is refused by name, by every script', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '01', 'after'));
  for (const text of ['{ "files": ', 'null']) {
    writeFileSync(join(plan, 'patch', '01.state'), text);
    for (const args of [['apply', 'all'], ['revert', '01'], ['record', '02', 'before']]) refused(patch(...args), /01\.state/);
  }
});

test('prompt-plan guards: a before record whose untracked list is missing or unreadable is refused by name', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  const list = join(plan, 'patch', '01.untracked');
  for (const text of [null, 'not gzip']) {
    if (text === null) rmSync(list);
    else writeFileSync(list, text);
    for (const phase of ['after', 'restore']) refused(patch('record', '01', phase), /01\.untracked/);
  }
});

test('prompt-plan guards: the scripts say so when git cannot run', { skip: WINDOWS && 'Windows finds git through its own search path' }, (t) => {
  const repo = startRepo(t);
  const { patch } = patchPlan(repo, ['01'], { PATH: join(repo.dir, 'no-such-folder') });
  refused(patch('record', '01', 'before'), /git could not run/);
});

test('prompt-plan guards: a git older than 2.25 is refused at the start, by every script', { skip: WINDOWS && 'the old git is a shell script' }, (t) => {
  const repo = startRepo(t);
  // A git that says it is old and runs the real one otherwise, so only the version check can tell it from the real one.
  const real = run('/bin/sh', ['-c', 'command -v git']).stdout.trim();
  const bin = join(repo.dir, 'old-git');
  mkdirSync(bin);
  writeFileSync(join(bin, 'git'), `#!/bin/sh\nif [ "$1" = "--version" ]; then echo 'git version 2.20.0'; exit 0; fi\nexec "${real}" "$@"\n`, { mode: 0o755 });
  const { patch } = patchPlan(repo, ['01'], { PATH: `${bin}${delimiter}${process.env.PATH}` });
  for (const args of [['record', '01', 'before'], ['apply', 'all'], ['revert', 'all']]) refused(patch(...args), /git 2\.25 or later; this is git version 2\.20\.0/);
  assert.equal(existsSync(join(repo.dir, '.temp', 'plans', 'p', 'patch', '01.before')), false);
});
