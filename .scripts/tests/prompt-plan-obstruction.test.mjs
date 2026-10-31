// How prompt-plan's patch scripts treat a fragment that puts a folder or a link where a file was, or the reverse: its
// patch removes what stands in the way, so apply and revert go on, and so does every other fragment, while something the
// patch does not remove, an untracked file included, still stops them and restore before they write anything.

import assert from 'node:assert/strict';
import { lstatSync, readFileSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

function setUp(t, files, numbers = ['01']) {
  const repo = startRepo(t, { 'kept.txt': 'before\n', ...files });
  const read = (path) => readFileSync(join(repo.dir, path), 'utf8');
  const remove = (path) => rmSync(join(repo.dir, path), { recursive: true, force: true });
  return { repo, read, remove, ...patchPlan(repo, numbers) };
}

test('prompt-plan obstruction: a file a fragment replaces by a folder reverts and applies, with every fragment', (t) => {
  const { repo, read, remove, patch } = setUp(t, { d: 'file\n' }, ['01', '02']);
  ok(patch('record', '01', 'before'));
  remove('d');
  repo.write('d/x.txt', 'x\n');
  ok(patch('record', '01', 'after', '--include', 'd/x.txt'));
  ok(patch('record', '02', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '02', 'after'));
  ok(patch('revert', '02'));
  ok(patch('revert', '01'));
  assert.equal(read('d'), 'file\n');
  ok(patch('apply', 'all'));
  assert.equal(read('d/x.txt'), 'x\n');
  assert.equal(read('kept.txt'), 'after\n');
  ok(patch('revert', 'all'));
  assert.equal(read('d'), 'file\n');
});

test('prompt-plan obstruction: a folder a fragment replaces by a file reverts, applies, and restores', (t) => {
  const { repo, read, remove, patch } = setUp(t, { 'd/x.txt': 'x\n' }, ['01', '02']);
  ok(patch('record', '01', 'before'));
  remove('d');
  repo.write('d', 'file\n');
  ok(patch('record', '01', 'after', '--include', 'd'));
  ok(patch('revert', '01'));
  assert.equal(read('d/x.txt'), 'x\n');
  ok(patch('apply', '01'));
  assert.equal(read('d'), 'file\n');
  // A fragment not yet recorded goes back over the same change, once the untracked file in the way is moved aside.
  ok(patch('record', '02', 'before'));
  remove('d');
  repo.write('d/y.txt', 'y\n');
  const stopped = patch('record', '02', 'restore');
  assert.equal(stopped.status, 1, `${stopped.stdout}${stopped.stderr}`);
  assert.match(stopped.stderr, /stands where[\s\S]*\n {2}d$/m);
  assert.equal(read('d/y.txt'), 'y\n');
  remove('d');
  ok(patch('record', '02', 'restore'));
  assert.equal(read('d'), 'file\n');
});

test('prompt-plan obstruction: a folder a fragment replaces by a link reverts and applies', { skip: WINDOWS && 'symbolic links need privileges on Windows' }, (t) => {
  const { repo, read, remove, patch } = setUp(t, { 'd/x.txt': 'x\n' });
  ok(patch('record', '01', 'before'));
  remove('d');
  symlinkSync('kept.txt', join(repo.dir, 'd'));
  ok(patch('record', '01', 'after', '--include', 'd'));
  ok(patch('revert', '01'));
  assert.equal(read('d/x.txt'), 'x\n');
  ok(patch('apply', '01'));
  assert.ok(lstatSync(join(repo.dir, 'd')).isSymbolicLink());
});

test('prompt-plan obstruction: a file a fragment replaces by a link reverts and applies', { skip: WINDOWS && 'symbolic links need privileges on Windows' }, (t) => {
  const { repo, read, remove, patch } = setUp(t, { 'other.txt': 'other\n' });
  ok(patch('record', '01', 'before'));
  remove('kept.txt');
  symlinkSync('other.txt', join(repo.dir, 'kept.txt'));
  ok(patch('record', '01', 'after'));
  ok(patch('revert', '01'));
  assert.ok(lstatSync(join(repo.dir, 'kept.txt')).isFile());
  assert.equal(read('kept.txt'), 'before\n');
  ok(patch('apply', '01'));
  assert.ok(lstatSync(join(repo.dir, 'kept.txt')).isSymbolicLink());
  assert.equal(readlinkSync(join(repo.dir, 'kept.txt')), 'other.txt');
});

test('prompt-plan obstruction: a decomposed name in a folder the patch replaces stops nothing', (t) => {
  const { repo, read, remove, patch } = setUp(t, { 'docs/café.md': 'doc\n' });
  if (process.platform !== 'darwin' || repo.git('config', '--bool', 'core.precomposeunicode').stdout.trim() !== 'true') {
    t.skip('git composes names only on macOS with core.precomposeunicode');
    return;
  }
  ok(patch('record', '01', 'before'));
  remove('docs');
  repo.write('docs', 'file\n');
  ok(patch('record', '01', 'after', '--include', 'docs'));
  ok(patch('revert', '01'));
  // The same file, under the decomposed name a macOS tool may write.
  remove('docs');
  repo.write('docs/café.md', 'doc\n');
  ok(patch('apply', '01'));
  assert.equal(read('docs'), 'file\n');
});

test('prompt-plan obstruction: a file the patch does not remove, in a folder it must replace, stops it first', (t) => {
  const { repo, read, remove, patch } = setUp(t, { d: 'file\n' });
  ok(patch('record', '01', 'before'));
  remove('d');
  repo.write('d/x.txt', 'x\n');
  ok(patch('record', '01', 'after', '--include', 'd/x.txt'));
  repo.write('d/extra.txt', 'mine\n');
  const result = patch('revert', '01');
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /stands where[\s\S]*\n {2}d$/m);
  assert.doesNotMatch(result.stderr, /^\s+at /m, 'the refusal carries a stack trace');
  assert.equal(read('d/x.txt'), 'x\n');
  assert.equal(read('d/extra.txt'), 'mine\n');
});
