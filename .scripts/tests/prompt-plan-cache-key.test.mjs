// What the pass cache's key covers: the tree as each check sees it, diffs git cannot rewrite, nested repositories with
// changes, and every file of check/ for the volatile marker.

import assert from 'node:assert/strict';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { makePlan } from './prompt-plan-cache-plan.mjs';

const run = (number, body, imports = '') => `import { existsSync, writeFileSync } from 'node:fs';\nimport { condition, runChecks${imports} } from './lib.mjs';\n${body}\n`
  + `runChecks('${number}', [condition('C', 'line', ${number === '01' ? 'true' : "existsSync('gen.txt')"})]);\n`;

test('prompt-plan pass cache: the key of each check is taken right before it, so a file an earlier check wrote counts', (t) => {
  const { repo, all, cached } = makePlan(t, { scripts: { '01': run('01', "writeFileSync('gen.txt', 'x');"), '02': run('02', '') } });
  assert.equal(all(['03']).status, 0);
  rmSync(join(repo.dir, 'gen.txt'));
  const again = all(['03']);
  assert.equal(again.status, 1, 'the second check needs the file the first check no longer writes');
  assert.ok(!cached(again).includes('02'), 'the pass of 02 was stored under the tree it saw');
});

test('prompt-plan pass cache: an external diff or textconv configured in git cannot hide a change to a tracked file', (t) => {
  const { repo, all, cached } = makePlan(t);
  repo.write('.gitattributes', 'kept.txt diff=hide\n');
  assert.equal(repo.git('add', '.gitattributes').status, 0);
  assert.equal(repo.git('commit', '-q', '-m', 'attributes').status, 0);
  repo.git('config', 'diff.external', 'node -e 0');
  repo.git('config', 'diff.hide.textconv', 'node -e 0');
  all(['03']);
  assert.deepEqual(cached(all(['03'])), ['01', '02'], 'control');
  repo.write('kept.txt', 'changed\n');
  assert.deepEqual(cached(all(['03'])), []);
});

test('prompt-plan pass cache: a tracked nested repository with changes of its own is never cached, a clean one is', (t) => {
  const { repo, all, cached } = makePlan(t);
  assert.equal(repo.git('init', '-q', 'nested').status, 0);
  repo.write('nested/a.txt', 'one\n');
  for (const args of [['add', '-A'], ['commit', '-q', '-m', 'nested']]) assert.equal(repo.git('-C', 'nested', ...args).status, 0);
  for (const args of [['add', 'nested'], ['commit', '-q', '-m', 'gitlink']]) assert.equal(repo.git(...args).status, 0);
  all(['03']);
  assert.deepEqual(cached(all(['03'])), ['01', '02'], 'a clean nested repository is covered by the commit');
  repo.write('nested/a.txt', 'two\n');
  all(['03']);
  assert.deepEqual(cached(all(['03'])), [], 'the changes of the nested repository are invisible to the key');
});

test('prompt-plan pass cache: a volatile call in a file the scripts import disables the cache', (t) => {
  const { check, all, cached } = makePlan(t);
  writeFileSync(join(check, 'helpers.mjs'), "import { volatile } from './lib.mjs';\nexport { volatile };\n");
  writeFileSync(join(check, 'more.mjs'), "import { volatile } from './lib.mjs';\nexport const line = (check) => volatile(check);\n");
  all(['03']);
  assert.deepEqual(cached(all(['03'])), []);
  assert.ok(existsSync(join(check, 'more.mjs')));
});
