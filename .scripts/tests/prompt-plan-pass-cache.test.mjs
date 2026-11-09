// The pass cache of the check runner that the prompt-plan skill copies into every plan: all NN skips the check of an
// earlier fragment whose last passing run saw the same scripts, tree, refs, and evidence, and prints where it passed.

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { makePlan } from './prompt-plan-cache-plan.mjs';

test('prompt-plan pass cache: a second all NN reuses the pass of earlier fragments, never the fragment NN itself, and names the log', (t) => {
  const { all, runs, cached } = makePlan(t);
  const first = all(['03']);
  assert.equal(first.status, 0, `${first.stdout}${first.stderr}`);
  assert.deepEqual(cached(first), []);
  const second = all(['03']);
  assert.equal(second.status, 0, `${second.stdout}${second.stderr}`);
  assert.deepEqual(cached(second), ['01', '02']);
  assert.deepEqual(runs(), [1, 1, 2]);
  assert.match(second.stdout, /PASS \(cached: .*01-check-.*\.log\)/);
});

for (const [name, change] of [
  ['a change to a tracked file', ({ repo }) => repo.write('kept.txt', 'after\n')],
  ['a new untracked file', ({ repo }) => repo.write('new.txt', 'new\n')],
  ['a new ref', ({ repo }) => assert.equal(repo.git('tag', 'v1').status, 0)],
  ['a new file in review/', ({ plan }) => { mkdirSync(join(plan, 'review'), { recursive: true }); writeFileSync(join(plan, 'review', '01-shot-2026-01-01T00-00-00-000Z.png'), 'x'); }],
]) {
  test(`prompt-plan pass cache: ${name} invalidates the pass`, (t) => {
    const plan = makePlan(t);
    plan.all(['03']);
    assert.deepEqual(plan.cached(plan.all(['03'])), ['01', '02'], 'the unchanged state is reused');
    change(plan);
    assert.deepEqual(plan.cached(plan.all(['03'])), []);
    assert.deepEqual(plan.runs(), [2, 2, 3]);
  });
}

test('prompt-plan pass cache: an edit of any file in check/ invalidates every pass', (t) => {
  const { check, all, runs, cached } = makePlan(t);
  all(['03']);
  assert.deepEqual(cached(all(['03'])), ['01', '02'], 'control');
  writeFileSync(join(check, '02-check.mjs'), `${readFileSync(join(check, '02-check.mjs'), 'utf8')}// edited\n`);
  assert.deepEqual(cached(all(['03'])), []);
  writeFileSync(join(check, 'lib.mjs'), `${readFileSync(join(check, 'lib.mjs'), 'utf8')}// edited\n`);
  assert.deepEqual(cached(all(['03'])), []);
  assert.deepEqual(runs(), [3, 3, 4]);
  assert.deepEqual(cached(all(['03'])), ['01', '02']);
  writeFileSync(join(check, 'more.mjs'), 'export const more = 1;\n');
  assert.deepEqual(cached(all(['03'])), [], 'a file the scripts import is part of the key');
});

test('prompt-plan pass cache: the contents of an untracked file are part of the key', (t) => {
  const plan = makePlan(t);
  plan.repo.write('new.txt', 'one\n');
  plan.all(['03']);
  assert.deepEqual(plan.cached(plan.all(['03'])), ['01', '02']);
  plan.repo.write('new.txt', 'two\n');
  assert.deepEqual(plan.cached(plan.all(['03'])), []);
});

test('prompt-plan pass cache: a failed or interrupted run stores nothing', (t) => {
  const { all, runs, cached } = makePlan(t);
  for (const mode of ['fail', 'kill']) {
    assert.notEqual(all(['03'], { BREAK: mode }).status, 0, mode);
    const again = all(['03'], { BREAK: mode });
    assert.ok(!cached(again).includes('01'), `${mode} is never stored`);
  }
  assert.equal(runs()[0], 4);
  assert.equal(all(['03']).status, 0);
  assert.deepEqual(cached(all(['03'])), ['01', '02'], 'a later pass is stored');
});

test('prompt-plan pass cache: --slow, all without NN, and a volatile line never use the cache', (t) => {
  const plain = makePlan(t);
  plain.all(['03']);
  assert.deepEqual(plain.cached(plain.all(['03'])), ['01', '02'], 'control');
  assert.deepEqual(plain.cached(plain.all(['03', '--slow'])), []);
  assert.deepEqual(plain.cached(plain.all()), []);
  assert.deepEqual(plain.runs(), [3, 3, 4]);
  const marked = makePlan(t, { volatile: true });
  marked.all(['03']);
  assert.deepEqual(marked.cached(marked.all(['03'])), ['02'], 'only the script without a volatile line is reused');
  assert.deepEqual(marked.runs(), [2, 1, 2]);
});
