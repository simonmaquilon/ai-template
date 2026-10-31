// What prompt-plan's record keeps and demands of untracked files: before writes NN.untracked, naming each file version
// control does not ignore and collapsing wholly ignored folders only, and lists the files it does not ignore; after refuses,
// before writing anything, a new one that is neither adopted with --include nor covered by --leave, while an ignored one
// needs neither, then removes NN.untracked; restore leaves every untracked file and lists the new ones.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const patchFiles = (plan) => readdirSync(join(plan, 'patch')).filter((name) => /^01\./.test(name)).sort();

function setUp(t, folder) {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'plans/keep.txt': 'keep\n', '.gitignore': '.temp/\n*.log\nbuild/\n' });
  return { repo, ...patchPlan(repo, ['01'], {}, folder) };
}

test('prompt-plan untracked: before keeps the untracked names without ignore rules and lists those not ignored', (t) => {
  const { repo, plan, patch } = setUp(t, join('plans', 'p'));
  repo.write('notes.txt', 'notes\n');
  repo.write('deps/pkg/a.js', 'a\n');
  repo.write('deps/pkg/b.js', 'b\n');
  repo.write('debug.log', 'log\n');
  repo.write('build/x.js', 'x\n');
  repo.write('build/y.js', 'y\n');
  mkdirSync(join(repo.dir, 'empty'));
  const before = patch('record', '01', 'before');
  ok(before);
  const names = JSON.parse(gunzipSync(readFileSync(join(plan, 'patch', '01.untracked'))).toString('utf8')).sort();
  // The plan's own entries are dropped, files not ignored come by name, a wholly ignored folder collapses, and an empty
  // folder holds no file.
  assert.deepEqual(names, ['build/', 'debug.log', 'deps/pkg/a.js', 'deps/pkg/b.js', 'notes.txt']);
  assert.match(before.stdout, /untracked[\s\S]*no patch carries[\s\S]*cannot be adopted later[\s\S]*deps\/pkg\/a\.js[\s\S]*notes\.txt/);
  assert.doesNotMatch(before.stdout, /debug\.log|build\/|plans\/p/);
});

test('prompt-plan untracked: a folder holding only ignored files collapses only when it is ignored itself', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', '.gitignore': '.temp/\n*.log\ncache/\nout/*\n' });
  const { plan, patch } = patchPlan(repo, ['01']);
  for (const path of ['cache/a.txt', 'cache/b.txt', 'data/a.log', 'data/b.log', 'out/a.js', 'out/b.js']) repo.write(path, 'x\n');
  ok(patch('record', '01', 'before'));
  // The plan's .temp/ and cache/ are ignored whole; data/ and out/ are not, since *.log and out/* match only what lies in them.
  assert.deepEqual(JSON.parse(gunzipSync(readFileSync(join(plan, 'patch', '01.untracked'))).toString('utf8')).sort(),
    ['.temp/', 'cache/', 'data/a.log', 'data/b.log', 'out/a.js', 'out/b.js']);
});

// check-ignore reads a folder's name as a pathspec, so a name that starts like pathspec magic must not be taken for magic.
for (const flag of ['--include', '--leave']) {
  test(`prompt-plan untracked: a folder named like pathspec magic, holding only ignored files, records, and a new file in it needs ${flag}`, (t) => {
    const repo = startRepo(t, { 'kept.txt': 'before\n', '.gitignore': '.temp/\n*.log\n' });
    try {
      repo.write(':(x/a.log', 'a\n');
    } catch {
      return t.skip('this file system cannot hold a folder named :(x');
    }
    repo.write(':(x/b.log', 'b\n');
    const { plan, patch } = patchPlan(repo, ['01']);
    ok(patch('record', '01', 'before'));
    assert.deepEqual(JSON.parse(gunzipSync(readFileSync(join(plan, 'patch', '01.untracked'))).toString('utf8')).sort(), ['.temp/', ':(x/a.log', ':(x/b.log']);
    repo.write(':(x/seed.md', 'seed\n');
    const refused = patch('record', '01', 'after');
    assert.equal(refused.status, 1, `${refused.stdout}${refused.stderr}`);
    assert.match(refused.stderr, /:\(x\/seed\.md/);
    assert.doesNotMatch(refused.stderr, /^\s+at /m);
    ok(patch('record', '01', 'after', flag, ':(x/seed.md'));
  });
}

test('prompt-plan untracked: a staged rename adds no name to the list, whatever its source is called', (t) => {
  const { repo, plan, patch } = setUp(t, join('plans', 'p'));
  // status -z writes the source of a rename as a field of its own, which here looks like an ignored entry.
  repo.write('!! old.txt', 'old\n');
  ok(repo.git('add', '--', '!! old.txt'));
  ok(repo.git('commit', '-q', '-m', 'old'));
  ok(repo.git('mv', '--', '!! old.txt', 'new.txt'));
  repo.write('x.log', 'ignored\n');
  ok(patch('record', '01', 'before'));
  assert.deepEqual(JSON.parse(gunzipSync(readFileSync(join(plan, 'patch', '01.untracked'))).toString('utf8')), ['x.log']);
});

test('prompt-plan untracked: before prints nothing about untracked files when version control ignores them all', (t) => {
  const { repo, patch } = setUp(t, join('.temp', 'plans', 'p'));
  repo.write('debug.log', 'log\n');
  const before = patch('record', '01', 'before');
  ok(before);
  assert.equal(before.stdout.trim(), 'Fragment 01: initial state recorded.');
});

test('prompt-plan untracked: after refuses a new untracked file that is neither adopted nor left, and writes nothing', (t) => {
  const { repo, plan, patch } = setUp(t, join('.temp', 'plans', 'p'));
  repo.write('present.txt', 'present\n');
  ok(patch('record', '01', 'before'));
  const held = patchFiles(plan);
  repo.write('new.txt', 'new\n');
  repo.write('sub/other.txt', 'other\n');
  repo.write('sub/more.txt', 'more\n');
  repo.write('x.log', 'ignored\n');
  mkdirSync(join(repo.dir, 'nested'));
  ok(repo.git('-C', 'nested', 'init', '-q'));
  const refused = patch('record', '01', 'after');
  assert.equal(refused.status, 1, `${refused.stdout}${refused.stderr}`);
  assert.match(refused.stderr, /new\.txt[\s\S]*sub\/more\.txt[\s\S]*sub\/other\.txt/);
  assert.doesNotMatch(refused.stderr, /x\.log|present\.txt|^\s+at /m);
  assert.deepEqual(patchFiles(plan), held, 'a refused after wrote something');
  // A folder covers the files below it, and a nested repository, which is no file, can only be left.
  const after = patch('record', '01', 'after', '--include', 'new.txt', '--leave', 'sub', '--leave', 'nested');
  ok(after);
  assert.doesNotMatch(after.stdout, /left out|kept as|exposed|ignored/, 'a report about ignored files is back');
  const state = JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8'));
  assert.deepEqual([Object.keys(state), state.included, state.left], [['root', 'beforeTree', 'afterTree', 'files', 'included', 'left'], ['new.txt'], ['sub', 'nested']]);
  assert.deepEqual(Object.keys(state.files), ['new.txt']);
  assert.deepEqual(patchFiles(plan), ['01.patch', '01.state'], 'before, untracked, and ignored lists are gone');
});

test('prompt-plan untracked: a file created in a folder that was empty at before is new', (t) => {
  const { repo, patch } = setUp(t, join('.temp', 'plans', 'p'));
  mkdirSync(join(repo.dir, 'empty'));
  ok(patch('record', '01', 'before'));
  repo.write('empty/f.txt', 'f\n');
  const refused = patch('record', '01', 'after');
  assert.equal(refused.status, 1, `${refused.stdout}${refused.stderr}`);
  assert.match(refused.stderr, /empty\/f\.txt/);
});

test('prompt-plan untracked: restore leaves every untracked file in place and lists the new ones', (t) => {
  const { repo, patch } = setUp(t, join('.temp', 'plans', 'p'));
  repo.write('notes.txt', 'notes\n');
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'changed\n');
  repo.write('notes.txt', 'edited\n');
  repo.write('new.txt', 'new\n');
  repo.write('x.log', 'ignored\n');
  const restore = patch('record', '01', 'restore');
  ok(restore);
  assert.match(restore.stdout, /left in place[\s\S]*new\.txt/);
  assert.doesNotMatch(restore.stdout, /notes\.txt|x\.log/);
  assert.equal(readFileSync(join(repo.dir, 'kept.txt'), 'utf8'), 'before\n');
  assert.deepEqual(['notes.txt', 'new.txt', 'x.log'].map((name) => readFileSync(join(repo.dir, name), 'utf8')), ['edited\n', 'new\n', 'ignored\n']);
  assert.equal(existsSync(join(repo.dir, '.temp', 'plans', 'p', 'patch', '01.untracked')), true, 'restore removed the record it still needs');
  const again = patch('record', '01', 'restore');
  ok(again);
  assert.match(again.stdout, /already matches/);
});
