// prompt-plan's apply and revert work only along the recorded sequence of fragments: they refuse a fragment out of
// order, contents no fragment recorded, and a mix of states from different fragments, changing no file.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

test('prompt-plan order: apply and revert refuse out of order, foreign contents, and mixed states, touching no file', (t) => {
  const repo = startRepo(t, { 'a.txt': 'a0\n', 'b.txt': 'b0\n' });
  const { patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('a.txt', 'a1\n');
  ok(patch('record', '01', 'after'));
  ok(patch('record', '02', 'before'));
  repo.write('a.txt', 'a2\n');
  repo.write('b.txt', 'b2\n');
  ok(patch('record', '02', 'after'));
  const contents = () => ['a.txt', 'b.txt'].map((path) => readFileSync(join(repo.dir, path), 'utf8'));
  const refused = (args, pattern) => {
    const before = contents();
    const result = patch(...args);
    assert.equal(result.status, 1, `${args.join(' ')}: ${result.stdout}${result.stderr}`);
    assert.match(result.stderr, pattern);
    assert.doesNotMatch(result.stderr, /^\s+at /m);
    assert.deepEqual(contents(), before, `${args.join(' ')} changed files`);
  };
  refused(['revert', '01'], /revert 02 first/);
  ok(patch('revert', 'all'));
  refused(['apply', '02'], /apply 01 first/);
  repo.write('b.txt', 'foreign\n');
  refused(['apply', 'all'], /match no recorded fragment state:[\s\S]*b\.txt/);
  // a.txt as before fragment 01, b.txt as after fragment 02.
  repo.write('b.txt', 'b2\n');
  refused(['apply', 'all'], /a mix of states/);
});
