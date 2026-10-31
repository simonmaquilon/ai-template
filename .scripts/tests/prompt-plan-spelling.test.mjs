// How prompt-plan's patch scripts compare names that the file system takes for the same one: an ignored file or
// folder a fragment renames only in case is no new untracked file where case does not tell names apart, and stays out
// of every patch, as a file a fragment replaces by a folder of that name in another case reverts and applies there, and
// on macOS --include records a decomposed name as git spells it, composed, so later fragments record it and a file held
// by that name before stays refused; a file in another case than the folder a patch needs stops apply as the folder's own
// name would.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const state = (plan, number) => JSON.parse(readFileSync(join(plan, 'patch', `${number}.state`), 'utf8'));

function ignoresCase(dir) {
  writeFileSync(join(dir, 'Probe'), '');
  const found = existsSync(join(dir, 'probe'));
  rmSync(join(dir, 'Probe'));
  return found;
}

for (const [label, from, to] of [['file', '.env', '.ENV'], ['folder', 'secrets', 'Secrets']]) {
  test(`prompt-plan spelling: an ignored ${label} renamed only in case is no new file, and stays out of the patch`, (t) => {
    const repo = startRepo(t, { 'kept.txt': 'before\n', '.gitignore': `.temp/\n${from}\n` });
    if (!ignoresCase(repo.dir)) {
      t.skip('this file system tells names apart by case');
      return;
    }
    repo.write(label === 'file' ? from : `${from}/key.txt`, 'TOKEN=case-secret\n');
    const { plan, patch } = patchPlan(repo, ['01']);
    ok(patch('record', '01', 'before'));
    renameSync(join(repo.dir, from), join(repo.dir, to));
    repo.write('.gitignore', '.temp/\n');
    ok(patch('record', '01', 'after'));
    assert.deepEqual(Object.keys(state(plan, '01').files), ['.gitignore']);
    assert.doesNotMatch(readFileSync(join(plan, 'patch', '01.patch'), 'utf8'), /case-secret/);
  });
}

// A name whose accent is a combining mark, as macOS file systems may keep it, and the same name composed.
const DECOMPOSED = 'café.txt';
const COMPOSED = 'café.txt';
const composes = (repo) => process.platform === 'darwin' && repo.git('config', '--bool', 'core.precomposeunicode').stdout.trim() === 'true';

test('prompt-plan spelling: --include records a decomposed name as git spells it, and later fragments record it', (t) => {
  const repo = startRepo(t);
  if (!composes(repo)) {
    t.skip('git composes names only on macOS with core.precomposeunicode');
    return;
  }
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  repo.write(`.temp/${DECOMPOSED}`, 'draft\n');
  ok(patch('record', '01', 'before'));
  renameSync(join(repo.dir, '.temp', DECOMPOSED), join(repo.dir, DECOMPOSED));
  ok(patch('record', '01', 'after', '--include', DECOMPOSED));
  assert.deepEqual(state(plan, '01').included, [COMPOSED]);
  assert.deepEqual(Object.keys(state(plan, '01').files), [COMPOSED]);
  ok(patch('record', '02', 'before'));
  repo.write(DECOMPOSED, 'edited\n');
  ok(patch('record', '02', 'after'));
  assert.deepEqual(Object.keys(state(plan, '02').files), [COMPOSED]);
});

test('prompt-plan spelling: --include refuses a decomposed name the working tree held before', (t) => {
  const repo = startRepo(t);
  if (!composes(repo)) {
    t.skip('git composes names only on macOS with core.precomposeunicode');
    return;
  }
  const { plan, patch } = patchPlan(repo, ['01']);
  repo.write(`secret-${DECOMPOSED}`, 'TOKEN=held-secret\n');
  ok(patch('record', '01', 'before'));
  const result = patch('record', '01', 'after', '--include', `secret-${DECOMPOSED}`);
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /held/);
  assert.equal(existsSync(join(plan, 'patch', '01.patch')), false);
});

test('prompt-plan spelling: a file a fragment replaces by a folder of the same name in another case reverts and applies', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', Docs: 'file\n' });
  if (!ignoresCase(repo.dir)) {
    t.skip('this file system tells names apart by case');
    return;
  }
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  rmSync(join(repo.dir, 'Docs'));
  repo.write('docs/index.md', 'index\n');
  ok(patch('record', '01', 'after', '--include', 'docs/index.md'));
  ok(patch('revert', '01'));
  ok(patch('apply', '01'));
  assert.equal(readFileSync(join(repo.dir, 'docs', 'index.md'), 'utf8'), 'index\n');
});

test('prompt-plan spelling: a file in another case than the folder a patch needs stops apply before it writes anything', (t) => {
  const repo = startRepo(t);
  if (!ignoresCase(repo.dir)) {
    t.skip('this file system tells names apart by case');
    return;
  }
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('d/x.txt', 'x\n');
  ok(patch('record', '01', 'after', '--include', 'd/x.txt'));
  ok(patch('revert', '01'));
  repo.write('D', 'mine\n');
  const result = patch('apply', '01');
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /stands where[\s\S]*\n {2}d\/x\.txt$/m);
  assert.doesNotMatch(result.stderr, /^\s+at /m);
  assert.equal(readFileSync(join(repo.dir, 'D'), 'utf8'), 'mine\n');
});
