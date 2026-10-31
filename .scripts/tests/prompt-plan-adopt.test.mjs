// Files an agent adopts with record after's --include: every later fragment captures them whatever ignore rules say,
// revert deletes them and apply restores them, one that is gone is absent, restore puts one back, a name git reads as
// pathspec magic is taken literally, and only a real file of the repository can be adopted, written from any folder;
// --leave names untracked files and folders only, so it refuses a file the index tracks or an earlier fragment adopted,
// but not one untracked at the before record and staged since, which no patch carries.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, patchPlan, run, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

// Fragment 01 adopts made.txt, and every later fragment starts from it.
function adopted(t, numbers = ['01', '02'], name = 'made.txt') {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, numbers);
  const state = (number) => JSON.parse(readFileSync(join(plan, 'patch', `${number}.state`), 'utf8'));
  const read = (path) => readFileSync(join(repo.dir, path), 'utf8');
  ok(patch('record', '01', 'before'));
  repo.write(name, 'one\n');
  ok(patch('record', '01', 'after', '--include', name));
  return { repo, plan, patch, state, read };
}

test('prompt-plan adopt: later fragments capture an adopted file, revert deletes it, and apply restores it', (t) => {
  const { repo, patch, state, read } = adopted(t);
  assert.deepEqual([state('01').included, state('01').left], [['made.txt'], []]);
  ok(patch('record', '02', 'before'));
  repo.write('made.txt', 'two\n');
  ok(patch('record', '02', 'after'));
  assert.deepEqual([Object.keys(state('02').files), state('02').included], [['made.txt'], []]);
  ok(patch('revert', 'all'));
  assert.equal(existsSync(join(repo.dir, 'made.txt')), false);
  ok(patch('apply', 'all'));
  assert.equal(read('made.txt'), 'two\n');
});

test('prompt-plan adopt: an adopted file that later becomes ignored is still captured, and revert removes it', (t) => {
  const { repo, patch, state, read } = adopted(t);
  ok(patch('record', '02', 'before'));
  repo.write('.gitignore', '.temp/\nmade.txt\n');
  repo.write('made.txt', 'two\n');
  ok(patch('record', '02', 'after'));
  assert.deepEqual(Object.keys(state('02').files).sort(), ['.gitignore', 'made.txt']);
  ok(patch('revert', '02'));
  assert.equal(read('made.txt'), 'one\n');
  ok(patch('revert', '01'));
  assert.equal(existsSync(join(repo.dir, 'made.txt')), false);
  ok(patch('apply', 'all'));
  assert.equal(read('made.txt'), 'two\n');
});

test('prompt-plan adopt: an adopted file that is gone is absent, and revert brings it back', (t) => {
  const { repo, patch, state, read } = adopted(t);
  ok(patch('record', '02', 'before'));
  rmSync(join(repo.dir, 'made.txt'));
  ok(patch('record', '02', 'after'));
  assert.equal(state('02').files['made.txt'].after, null);
  ok(patch('revert', '02'));
  assert.equal(read('made.txt'), 'one\n');
});

test('prompt-plan adopt: an adopted file replaced by a folder is absent, and nothing in the folder is captured', (t) => {
  const { repo, patch, state } = adopted(t);
  ok(patch('record', '02', 'before'));
  rmSync(join(repo.dir, 'made.txt'));
  repo.write('made.txt/inner.txt', 'inner\n');
  ok(patch('record', '02', 'after', '--leave', 'made.txt'));
  assert.deepEqual(Object.entries(state('02').files).map(([path, { after }]) => [path, after]), [['made.txt', null]]);
});

test('prompt-plan adopt: restore puts an earlier fragment\'s adopted file back, and leaves the rest as it is', (t) => {
  const { repo, patch, read } = adopted(t);
  ok(patch('record', '02', 'before'));
  repo.write('made.txt', 'two\n');
  repo.write('stray.txt', 'stray\n');
  ok(patch('record', '02', 'restore'));
  assert.equal(read('made.txt'), 'one\n');
  assert.equal(read('stray.txt'), 'stray\n');
});

test('prompt-plan adopt: --leave refuses a file the index tracks or an earlier fragment adopted, writing nothing', (t) => {
  const { repo, plan, patch } = adopted(t);
  ok(patch('record', '02', 'before'));
  repo.write('made.txt', 'two\n');
  repo.write('kept.txt', 'changed\n');
  repo.write('staged.txt', 'staged\n');
  ok(repo.git('add', 'staged.txt'));
  for (const path of ['kept.txt', 'staged.txt', 'made.txt']) {
    const refused = patch('record', '02', 'after', '--leave', path);
    assert.equal(refused.status, 1, `--leave ${path}: ${refused.stdout}${refused.stderr}`);
    assert.match(refused.stderr, new RegExp(`--leave[^\\n]*untracked[\\s\\S]*\\n {2}${path.replace('.', '\\.')}$`, 'm'));
    assert.doesNotMatch(refused.stderr, /^\s+at /m);
    assert.equal(existsSync(join(plan, 'patch', '02.state')), false);
  }
  // Their changes belong to the patch.
  ok(patch('record', '02', 'after'));
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(plan, 'patch', '02.state'), 'utf8')).files).sort(), ['kept.txt', 'made.txt', 'staged.txt']);
});

test('prompt-plan adopt: --leave takes a file untracked at before and staged since, which no patch carries', (t) => {
  const { repo, plan, patch } = adopted(t);
  repo.write('notes.txt', 'notes\n');
  ok(patch('record', '02', 'before'));
  ok(repo.git('add', 'notes.txt'));
  repo.write('notes.txt', 'edited\n');
  ok(patch('record', '02', 'after', '--leave', 'notes.txt'));
  const state = JSON.parse(readFileSync(join(plan, 'patch', '02.state'), 'utf8'));
  assert.deepEqual([Object.keys(state.files), state.left], [[], ['notes.txt']]);
});

test('prompt-plan adopt: a name git reads as pathspec magic is adopted literally', { skip: WINDOWS && 'Windows file names hold no colon' }, (t) => {
  const { repo, patch, state, read } = adopted(t, ['01', '02'], ':notes');
  assert.deepEqual(state('01').included, [':notes']);
  ok(patch('record', '02', 'before'));
  repo.write(':notes', 'two\n');
  ok(patch('record', '02', 'after'));
  assert.deepEqual(Object.keys(state('02').files), [':notes']);
  ok(patch('revert', 'all'));
  ok(patch('apply', 'all'));
  assert.equal(read(':notes'), 'two\n');
});

test('prompt-plan adopt: --include takes only real files of the repository, written from the current folder', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01']);
  mkdirSync(join(repo.dir, 'sub'));
  repo.write('.temp/draft.txt', 'drafted\n');
  ok(patch('record', '01', 'before'));
  renameSync(join(repo.dir, '.temp', 'draft.txt'), join(repo.dir, 'sub', 'draft.txt'));
  const NO_FILE = (flag, path, what) => new RegExp(`${flag} ${path.replace(/\./g, '\\.')} names no ${what} inside the repository, outside the plan and outside \\.git\\.`);
  for (const [args, wording] of [
    [['x', '--include', '--include', 'y']],
    [['--include']],
    [['--include', 'missing.txt'], NO_FILE('--include', 'missing.txt', 'file')],
    [['--include', '../outside'], NO_FILE('--include', '../outside', 'file')],
    [['--leave', 'missing'], NO_FILE('--leave', 'missing', 'file or folder')],
  ]) {
    const refused = patch('record', '01', 'after', ...args);
    assert.equal(refused.status, 1, `record 01 after ${args.join(' ')} was accepted`);
    assert.doesNotMatch(refused.stderr, /^\s+at /m);
    if (wording) assert.match(refused.stderr, wording);
  }
  // From the folder the file lies in, as an agent that changed directory writes it.
  const from = run(process.execPath, [join(plan, 'patch', 'record.mjs'), '01', 'after', '--include', './draft.txt'], { cwd: join(repo.dir, 'sub') });
  ok(from);
  assert.deepEqual(JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8')).included, ['sub/draft.txt']);
});
