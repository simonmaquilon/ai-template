import assert from 'node:assert/strict';
import { chmodSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, makeRepo, run, startRepo } from './support.mjs';

const STAR = 'Unordered list style [Expected: dash; Actual: asterisk]';
const SPACES = 'Trailing spaces [Expected: 0 or 2; Actual: 3]';
const UNAVAILABLE = '--all: not checked; git or this repository is unavailable.\n';
const all = (repo, cwd = repo.dir, env = process.env) =>
  run(process.execPath, [join(repo.dir, '.scripts', 'check-markdown.mjs'), '--all'], { cwd, env });
const lines = (result) => result.stdout.split('\n').filter(Boolean).sort();

test('markdown --all: lints whole every Git-listed regular file that no attribute marks, from any folder', (t) => {
  const repo = startRepo(t, {
    '.gitattributes': 'vendor/** linguist-vendored\ngenerated/** linguist-generated\n',
    '.gitignore': '.temp/\nignored/\n',
    'docs/tracked.md': '* a\n', 'docs/clean.md': '# A\n', 'gone.md': '* a\n', 'old/inner.md': '* a\n',
    'vendor/v.md': '* a\n', 'generated/g.md': '* a\n',
  });
  rmSync(join(repo.dir, 'gone.md'));
  rmSync(join(repo.dir, 'old'), { recursive: true });
  repo.write('old', 'now a file\n');
  repo.write('docs/new.md', 'b   \n');
  repo.write('docs/UPPER.MD', '* a\n');
  repo.write('ignored/i.md', '* a\n');
  const expected = [`docs/UPPER.MD:1 [MD004] ${STAR}`, `docs/new.md:1 [MD009] ${SPACES}`, `docs/tracked.md:1 [MD004] ${STAR}`];
  for (const cwd of [repo.dir, join(repo.dir, 'docs')]) {
    const result = all(repo, cwd);
    assert.deepEqual([result.status, lines(result), result.stderr], [1, expected, ''], cwd);
  }
});

test('markdown --all: skips symbolic links, tracked or not, instead of reading what they point to', { skip: WINDOWS }, (t) => {
  const repo = makeRepo(t);
  const outside = makeRepo(t);
  outside.write('outside.md', '* a\n');
  for (const name of ['link.md', 'tracked-link.md']) symlinkSync(join(outside.dir, 'outside.md'), join(repo.dir, name));
  repo.git('add', 'tracked-link.md');
  const result = all(repo);
  assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', '']);
});

test('markdown --all: a repository without warnings, or without Markdown files, exits 0 and prints nothing', (t) => {
  const repo = makeRepo(t);
  for (const clean of [false, true]) {
    if (clean) repo.write('docs/clean.md', '# A\n');
    const result = all(repo);
    assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', ''], String(clean));
  }
});

test('markdown --all: exits 2 and checks nothing outside a repository or without git', (t) => {
  const repo = makeRepo(t);
  repo.write('x.md', '* a\n');
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'PATH')), PATH: '' };
  const noGit = all(repo, repo.dir, env);
  rmSync(join(repo.dir, '.git'), { recursive: true, force: true });
  const noRepo = all(repo);
  for (const result of [noGit, noRepo]) assert.deepEqual([result.status, result.stdout, result.stderr], [2, '', UNAVAILABLE]);
});

test('markdown --all: exits 2 for a file it could not read, and 1 when it also printed a warning', { skip: WINDOWS || process.getuid?.() === 0 }, (t) => {
  const repo = makeRepo(t);
  repo.write('locked.md', '# A\n');
  repo.write('locked/b.md', '# A\n');
  repo.git('add', 'locked/b.md');
  chmodSync(join(repo.dir, 'locked.md'), 0o000);
  chmodSync(join(repo.dir, 'locked'), 0o000);
  try {
    const locked = all(repo);
    assert.deepEqual([locked.status, locked.stdout, locked.stderr.split('\n').filter(Boolean).sort()],
      [2, '', ['locked.md: not checked; EACCES', 'locked/b.md: not checked; EACCES']]);
    repo.write('warn.md', '* a\n');
    const both = all(repo);
    assert.deepEqual([both.status, both.stdout], [1, `warn.md:1 [MD004] ${STAR}\n`]);
  } finally {
    chmodSync(join(repo.dir, 'locked'), 0o755);
  }
});

test('markdown --all: skips a tracked folder replaced by a symbolic link to a folder outside the repository', { skip: WINDOWS }, (t) => {
  const repo = startRepo(t, { 'd/a.md': '* a\n' });
  const outside = makeRepo(t);
  outside.write('d/a.md', '* a\n');
  rmSync(join(repo.dir, 'd'), { recursive: true });
  symlinkSync(join(outside.dir, 'd'), join(repo.dir, 'd'));
  const skipped = all(repo);
  assert.deepEqual([skipped.status, skipped.stdout, skipped.stderr], [0, '', '']);
  repo.write('warn.md', '* a\n');
  const linted = all(repo);
  assert.deepEqual([linted.status, linted.stdout, linted.stderr], [1, `warn.md:1 [MD004] ${STAR}\n`, '']);
});
