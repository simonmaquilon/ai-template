// On a file system that does not tell names apart by case, prompt-plan's record after refuses a rename that only
// changes case before it stores anything: the file --include named in the refused run leaves no object in the plan.

import assert from 'node:assert/strict';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { holds, patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

function ignoresCase(dir) {
  writeFileSync(join(dir, 'Probe'), '');
  const found = existsSync(join(dir, 'probe'));
  rmSync(join(dir, 'Probe'));
  return found;
}

test('prompt-plan case objects: a refused record after stores no object of the file --include named', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'Notes.md': 'notes\n' });
  if (!ignoresCase(repo.dir)) {
    t.skip('this file system tells names apart by case');
    return;
  }
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  ok(repo.git('rm', '-q', 'Notes.md'));
  ok(patch('record', '01', 'after'));
  ok(patch('record', '02', 'before'));
  const text = 'only in the refused run\n';
  repo.write('notes.md', text);
  const after = patch('record', '02', 'after', '--include', 'notes.md');
  assert.equal(after.status, 1, `${after.stdout}${after.stderr}`);
  assert.match(after.stderr, /earlier fragment 01: Notes\.md -> notes\.md/);
  assert.equal(holds(repo, plan, text), false, 'the refused run stored the file');
});
