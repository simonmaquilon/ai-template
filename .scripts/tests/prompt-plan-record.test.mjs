// What prompt-plan's record script keeps of each fragment: a patch that the diff configuration of the person who
// runs it never changes, and snapshots that git gc never prunes, with a clear refusal when the repository lost
// objects a snapshot shares with it; record after also lists what changed between two records.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { makeRepo, numbered, patchPlan, run } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

function startRepo(t, files = { 'kept.txt': 'before\n' }) {
  const repo = makeRepo(t);
  for (const [path, text] of Object.entries(files)) repo.write(path, text);
  ok(repo.git('add', '-A'));
  ok(repo.git('commit', '-q', '-m', 'start'));
  return repo;
}

test('prompt-plan record: the patch ignores the diff configuration and environment, and reverts and applies', (t) => {
  const repo = startRepo(t, { 'lines.txt': numbered(20), 'data.bin': '\0\x01\x02\x03' });
  const config = [['diff.noprefix', 'true'], ['color.diff', 'always'], ['color.ui', 'always'], ['diff.context', '0'],
    ['diff.srcPrefix', 'x/'], ['diff.external', 'echo ext'], ['diff.suppressBlankEmpty', 'true'], ['diff.shout.textconv', 'echo tc']];
  for (const [key, value] of config) ok(repo.git('config', key, value));
  repo.write(join('.git', 'info', 'attributes'), '* diff=shout\n');
  const { plan, patch } = patchPlan(repo, ['01'], { GIT_DIFF_OPTS: '--unified=0' });
  ok(patch('record', '01', 'before'));
  repo.write('lines.txt', numbered(20).replace('line 10\n', 'line ten\n'));
  repo.write('data.bin', '\0\x09\x02\x03');
  repo.write('added.txt', 'new\n');
  ok(patch('record', '01', 'after', '--include', 'added.txt'));
  const text = readFileSync(join(plan, 'patch', '01.patch'), 'utf8');
  assert.match(text, /^diff --git a\/lines\.txt b\/lines\.txt$/m);
  assert.match(text, /^ line 9$/m, 'the patch keeps its context lines');
  assert.doesNotMatch(text, /\x1b|ext|tc /);
  const read = (path) => readFileSync(join(repo.dir, path), 'utf8');
  ok(patch('revert', '01'));
  assert.equal(read('lines.txt'), numbered(20));
  assert.equal(read('data.bin'), '\0\x01\x02\x03');
  assert.equal(existsSync(join(repo.dir, 'added.txt')), false);
  ok(patch('apply', '01'));
  assert.match(read('lines.txt'), /^line ten$/m);
  assert.equal(read('data.bin'), '\0\x09\x02\x03');
});

test('prompt-plan record: snapshots live in the plan and survive git gc, and record after lists what changed between records', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'between.txt': 'between\n' });
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  repo.write('draft.txt', 'draft\n');
  ok(patch('record', '01', 'before'));
  const blob = repo.git('hash-object', 'draft.txt').stdout.trim();
  assert.notEqual(repo.git('cat-file', '-e', blob).status, 0, 'the snapshot wrote the draft into the repository');
  assert.ok(existsSync(join(plan, 'patch', 'objects')));
  repo.write('kept.txt', 'one\n');
  ok(repo.git('gc', '--prune=now', '-q'));
  const first = patch('record', '01', 'after');
  ok(first);
  assert.doesNotMatch(first.stdout, /between\.txt/, 'fragment 01 has no earlier record to compare with');
  repo.write('between.txt', 'edited\n');
  ok(patch('record', '02', 'before'));
  repo.write('kept.txt', 'two\n');
  ok(repo.git('gc', '--prune=now', '-q'));
  const second = patch('record', '02', 'after');
  ok(second);
  assert.match(second.stdout, /between\.txt/);
  assert.doesNotMatch(second.stdout, /kept\.txt|draft\.txt/);
  ok(patch('revert', 'all'));
  assert.equal(readFileSync(join(repo.dir, 'kept.txt'), 'utf8'), 'before\n');
  ok(patch('apply', 'all'));
  assert.equal(readFileSync(join(repo.dir, 'kept.txt'), 'utf8'), 'two\n');
});

test('prompt-plan record: a snapshot that lost objects it shared with the repository is refused with a clear message', (t) => {
  const repo = startRepo(t);
  const { patch } = patchPlan(repo, ['01']);
  // Staged before the snapshot, its blob stays only in the repository, which prunes it once nothing stages it.
  repo.write('staged.txt', 'staged\n');
  ok(repo.git('add', 'staged.txt'));
  ok(patch('record', '01', 'before'));
  ok(repo.git('rm', '--cached', '-q', 'staged.txt'));
  rmSync(join(repo.dir, 'staged.txt'));
  writeFileSync(join(repo.dir, 'kept.txt'), 'changed\n');
  ok(repo.git('gc', '--prune=now', '-q'));
  const restore = patch('record', '01', 'restore');
  assert.equal(restore.status, 1, `${restore.stdout}${restore.stderr}`);
  assert.match(restore.stderr, /pruned/);
  assert.doesNotMatch(restore.stderr, /^\s+at /m, 'the refusal carries a stack trace');
});

test('prompt-plan record: a snapshot git cannot read is refused with git\'s reason and no stack trace', (t) => {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  writeFileSync(join(plan, 'patch', '01.before'), 'not-a-tree\n');
  repo.write('kept.txt', 'changed\n');
  const after = patch('record', '01', 'after');
  assert.equal(after.status, 1, `${after.stdout}${after.stderr}`);
  assert.match(after.stderr, /could not be read[\s\S]*not-a-tree/);
  assert.doesNotMatch(after.stderr, /^\s+at /m, 'the refusal carries a stack trace');
});

test('prompt-plan record: a sparse partial clone records although its promisor remote still holds unfetched blobs', (t) => {
  const source = startRepo(t, { 'in/i.txt': 'in\n', 'out/o.txt': 'out\n' });
  ok(source.git('config', 'uploadpack.allowFilter', 'true'));
  const clone = join(source.dir, '.temp', 'clone');
  // LF line endings, as makeRepo keeps them, where Git for Windows sets core.autocrlf=true.
  ok(run('git', ['clone', '-q', '-c', 'core.autocrlf=false', '--filter=blob:none', '--sparse', pathToFileURL(source.dir).href, clone]));
  ok(run('git', ['sparse-checkout', 'set', 'in'], { cwd: clone }));
  const repo = { dir: clone, write: (path, text) => writeFileSync(join(clone, path), text) };
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('in/i.txt', 'changed\n');
  ok(patch('record', '01', 'after'));
  ok(patch('revert', '01'));
  assert.equal(readFileSync(join(clone, 'in', 'i.txt'), 'utf8'), 'in\n');
});

test('prompt-plan record: snapshots keep reading the alternates the environment already names', (t) => {
  const repo = startRepo(t);
  // A file staged while the environment names another repository's objects as an alternate, whose blob only that one holds.
  const other = startRepo(t, { 'shared.txt': 'shared\n' });
  const env = { GIT_ALTERNATE_OBJECT_DIRECTORIES: join(other.dir, '.git', 'objects') };
  repo.write('shared.txt', 'shared\n');
  // Older than the index, so no snapshot rehashes it into patch/objects as a racily clean entry.
  const past = new Date(Date.now() - 60000);
  utimesSync(join(repo.dir, 'shared.txt'), past, past);
  ok(run('git', ['add', 'shared.txt'], { cwd: repo.dir, env: { ...process.env, ...env } }));
  assert.notEqual(repo.git('cat-file', '-e', other.git('hash-object', 'shared.txt').stdout.trim()).status, 0);
  const { patch } = patchPlan(repo, ['01'], env);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'changed\n');
  ok(patch('record', '01', 'after'));
  ok(patch('revert', '01'));
  assert.equal(readFileSync(join(repo.dir, 'kept.txt'), 'utf8'), 'before\n');
});
