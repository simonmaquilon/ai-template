// What prompt-plan's records capture: what git tracks and what the agent adopts, nothing else. A file that version
// control ignores, or an untracked one it does not, there at the before record or created during the fragment, reaches
// no patch, state, or object, also once the fragment or someone between two records drops the rule that ignored it, and
// revert and apply leave it as it is.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { holds, patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const state = (plan, number) => JSON.parse(readFileSync(join(plan, 'patch', `${number}.state`), 'utf8'));
const SECRET = 'TOKEN=secret-value\n';

function setUp(t, numbers = ['01']) {
  const repo = startRepo(t, { 'kept.txt': 'before\n', '.gitignore': '.temp/\n.env\n*.secret\n' });
  const read = (path) => readFileSync(join(repo.dir, path), 'utf8');
  return { repo, read, ...patchPlan(repo, numbers) };
}

test('prompt-plan ignore: ignored and untracked files, there before or created during the fragment, are never captured', (t) => {
  const { repo, read, plan, patch } = setUp(t);
  repo.write('a.secret', 'secret-a\n');
  repo.write('draft.txt', 'draft-one\n');
  ok(patch('record', '01', 'before'));
  repo.write('a.secret', 'secret-a2\n');
  repo.write('b.secret', 'secret-b\n');
  repo.write('draft.txt', 'draft-two\n');
  repo.write('new.txt', 'new-file\n');
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '01', 'after', '--leave', 'new.txt'));
  assert.deepEqual(Object.keys(state(plan, '01').files), ['kept.txt']);
  assert.deepEqual([state(plan, '01').included, state(plan, '01').left], [[], ['new.txt']]);
  ok(patch('revert', '01'));
  ok(patch('apply', '01'));
  for (const text of ['secret-a', 'secret-a2', 'secret-b', 'draft-one', 'draft-two', 'new-file']) assert.equal(holds(repo, plan, `${text}\n`), false, text);
  assert.deepEqual(['a.secret', 'b.secret', 'draft.txt', 'new.txt'].map(read), ['secret-a2\n', 'secret-b\n', 'draft-two\n', 'new-file\n']);
});

for (const when of ['by the fragment', 'between the records']) {
  test(`prompt-plan ignore: a file whose rule is dropped ${when} stays out of every patch and object`, (t) => {
    const { repo, read, plan, patch } = setUp(t, ['01', '02']);
    const early = when === 'by the fragment';
    repo.write('.env', SECRET);
    ok(patch('record', '01', 'before'));
    if (early) repo.write('.gitignore', '.temp/\n');
    repo.write('kept.txt', 'one\n');
    ok(patch('record', '01', 'after'));
    if (!early) repo.write('.gitignore', '.temp/\n');
    ok(patch('record', '02', 'before'));
    repo.write('.env', 'TOKEN=secret-value-2\n');
    repo.write('kept.txt', 'two\n');
    const after = patch('record', '02', 'after');
    ok(after);
    assert.deepEqual(Object.keys(state(plan, '02').files), ['kept.txt']);
    // The rule's change came before the record, which lists it as changed between the two records.
    if (!early) assert.match(after.stdout, /files changed between[\s\S]*\.gitignore/);
    ok(patch('revert', 'all'));
    ok(patch('apply', 'all'));
    for (const text of [SECRET, 'TOKEN=secret-value-2\n']) assert.equal(holds(repo, plan, text), false, text);
    assert.equal(read('.env'), 'TOKEN=secret-value-2\n');
  });
}

test('prompt-plan ignore: a file that becomes ignored during the fragment stays as it was, and no patch carries it', (t) => {
  const { repo, read, plan, patch } = setUp(t);
  repo.write('notes.txt', 'mine\n');
  ok(patch('record', '01', 'before'));
  repo.write('.gitignore', '.temp/\nnotes.txt\n');
  repo.write('notes.txt', 'edited-notes\n');
  ok(patch('record', '01', 'after'));
  assert.deepEqual(Object.keys(state(plan, '01').files), ['.gitignore']);
  ok(patch('revert', '01'));
  assert.equal(read('.gitignore'), '.temp/\n.env\n*.secret\n');
  assert.equal(read('notes.txt'), 'edited-notes\n');
  assert.equal(holds(repo, plan, 'edited-notes\n'), false);
});
