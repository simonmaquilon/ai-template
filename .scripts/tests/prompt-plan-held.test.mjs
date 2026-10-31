// Which names record after's --include refuses as held, because the working tree held them at the before record: a file
// the before snapshot names, one NN.untracked names, one lying under an ignored folder NN.untracked names whole, one an
// earlier fragment adopted, and the same name written in another case, which the file system takes for it. A refusal
// writes nothing, and a name the working tree did not hold goes in, also in a folder of untracked files that was there.
// An ignored file is held too where its folder also holds a file that is not ignored, as with a negation rule or a folder
// standing where a tracked file was, and git add -f on it later leaves it out of the patch. A folder that holds only
// ignored files without being ignored itself holds just those files, so a new file in it is no held one. The refusal
// says how: by name, inside a folder NN.untracked lists as one name, or by a spelling that differs only in case.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { holds, patchPlan, startRepo } from './support.mjs';

const STAGED = /files staged since its before record that the working tree held untracked then, or created inside a folder it held untracked whole, which no patch carries:/;
const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const refused = (result, pattern) => {
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, pattern);
  assert.doesNotMatch(result.stderr, /^\s+at /m, 'the refusal carries a stack trace');
};
const BY_NAME = /held by that name before this fragment, which no patch carries, so leave them as they are; only a commit the prompt authorizes can start tracking one:/;
const IN_FOLDER = /inside a folder that 02\.untracked lists as one name/;
const IN_CASE = /only in case, which git does not record as a rename/;
// The refusal gives the wording for how the name was held, and no other, with the name listed under it.
const refusedAs = (result, wording, path) => {
  refused(result, wording);
  for (const other of [BY_NAME, IN_FOLDER, IN_CASE].filter((pattern) => pattern !== wording)) assert.doesNotMatch(result.stderr, other);
  assert.ok(result.stderr.endsWith(`\n  ${path}\n`), result.stderr);
};

function ignoresCase(dir) {
  writeFileSync(join(dir, 'Probe'), '');
  const found = existsSync(join(dir, 'probe'));
  rmSync(join(dir, 'Probe'));
  return found;
}

// A tracked file, an untracked one, and a folder with nothing tracked, all there at the before record of fragment 02.
function held(t) {
  const repo = startRepo(t, { 'kept.txt': 'before\n', '.gitignore': '.temp/\nbuild/\n' });
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('made.txt', 'one\n');
  ok(patch('record', '01', 'after', '--include', 'made.txt'));
  repo.write('notes.txt', 'notes\n');
  repo.write('scratch/inner.txt', 'inner\n');
  repo.write('build/old.js', 'old\n');
  ok(patch('record', '02', 'before'));
  repo.write('scratch/created.txt', 'created\n');
  repo.write('build/new.js', 'new\n');
  repo.write('fresh.txt', 'fresh\n');
  const nothing = () => ['02.patch', '02.state'].every((name) => !existsSync(join(plan, 'patch', name)));
  return { repo, plan, patch, nothing };
}

test('prompt-plan held: --include refuses a tracked, an untracked, and an adopted file by name, and one in an ignored folder as part of it', (t) => {
  const { patch, nothing } = held(t);
  for (const path of ['kept.txt', 'notes.txt', 'scratch/inner.txt', 'made.txt']) {
    refusedAs(patch('record', '02', 'after', '--include', path), BY_NAME, path);
  }
  refusedAs(patch('record', '02', 'after', '--include', 'build/new.js'), IN_FOLDER, 'build/new.js');
  assert.equal(nothing(), true);
  // A file created in a folder of untracked files is new, as one created anywhere else is; one in an ignored folder
  // needs neither --include nor --leave.
  refused(patch('record', '02', 'after', '--include', 'fresh.txt'), /scratch\/created\.txt/);
  ok(patch('record', '02', 'after', '--include', 'fresh.txt', '--include', 'scratch/created.txt'));
});

test('prompt-plan held: --include refuses a held name written in another case', (t) => {
  const { repo, patch, nothing } = held(t);
  if (!ignoresCase(repo.dir)) {
    t.skip('this file system tells names apart by case');
    return;
  }
  for (const path of ['KEPT.TXT', 'Notes.txt', 'SCRATCH/Inner.txt', 'MADE.txt']) refused(patch('record', '02', 'after', '--include', path), BY_NAME);
  assert.equal(nothing(), true);
});

// A file renamed on disk keeps its old spelling in the before snapshot; an untracked one has no recorded spelling to differ from.
test('prompt-plan held: --include says a snapshot file renamed only in case is a rename git does not record', (t) => {
  const { repo, patch, nothing } = held(t);
  if (!ignoresCase(repo.dir)) {
    t.skip('this file system tells names apart by case');
    return;
  }
  renameSync(join(repo.dir, 'made.txt'), join(repo.dir, 'MADE.txt'));
  refusedAs(patch('record', '02', 'after', '--include', 'MADE.txt'), IN_CASE, 'MADE.txt');
  const mixed = patch('record', '02', 'after', '--include', 'MADE.txt', '--include', 'build/new.js', '--include', 'kept.txt');
  for (const wording of [IN_CASE, IN_FOLDER, BY_NAME]) refused(mixed, wording);
  renameSync(join(repo.dir, 'notes.txt'), join(repo.dir, 'Notes.txt'));
  refusedAs(patch('record', '02', 'after', '--include', 'Notes.txt'), BY_NAME, 'Notes.txt');
  assert.equal(nothing(), true);
});

// An ignored file next to files that are not ignored: the folder is mixed, so git lists no ignored folder for it.
const LAYOUTS = [
  ['a mixed folder', '.temp/\n*.env\n', { 'tools/local.env': 'TOKEN=secret\n', 'tools/notes.md': 'notes\n' }, 'tools/local.env'],
  ['a negation rule', '.temp/\nbuild/*\n!build/keep.txt\n', { 'build/out.js': 'out\n', 'build/keep.txt': 'keep\n' }, 'build/out.js'],
];

function layout(t, rules, files, tracked = {}) {
  const repo = startRepo(t, { 'kept.txt': 'before\n', '.gitignore': rules, ...tracked });
  for (const path of Object.keys(tracked)) rmSync(join(repo.dir, path));
  for (const [path, text] of Object.entries(files)) repo.write(path, text);
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  return { repo, plan, patch };
}

for (const [label, rules, files, ignored] of LAYOUTS) {
  test(`prompt-plan held: --include refuses an ignored file in ${label}`, (t) => {
    const { plan, patch } = layout(t, rules, files);
    refused(patch('record', '01', 'after', '--include', ignored), BY_NAME);
    assert.equal(existsSync(join(plan, 'patch', '01.state')), false);
  });

  test(`prompt-plan held: git add -f on an ignored file in ${label} keeps it out of the patch, and after says so`, (t) => {
    const { repo, plan, patch } = layout(t, rules, files);
    ok(repo.git('add', '-f', ignored));
    repo.write(ignored, 'TOKEN=edited\n');
    repo.write('kept.txt', 'after\n');
    const after = patch('record', '01', 'after');
    ok(after);
    assert.match(after.stdout, STAGED);
    assert.ok(after.stdout.includes(`\n  ${ignored}\n`), after.stdout);
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8')).files), ['kept.txt']);
    assert.equal(holds(repo, plan, 'TOKEN=edited\n'), false);
  });
}

test('prompt-plan held: --include refuses an ignored file in a folder that stands where a tracked file was', (t) => {
  const { patch } = layout(t, '.temp/\n*.log\n', { 'd/x.log': 'log\n' }, { d: 'file\n' });
  refused(patch('record', '01', 'after', '--include', 'd/x.log'), BY_NAME);
});

// Nothing names the folder itself, so it holds just the ignored files it has and anything made there is new.
for (const flag of ['--include', '--leave']) {
  test(`prompt-plan held: a folder holding only ignored files is not held whole, so a new file in it needs ${flag}`, (t) => {
    const { repo, plan, patch } = layout(t, '.temp/\n*.log\n', { 'data/a.log': 'a\n', 'data/b.log': 'b\n' });
    repo.write('data/seed.md', 'seed\n');
    refused(patch('record', '01', 'after'), /data\/seed\.md/);
    refused(patch('record', '01', 'after', '--include', 'data/a.log'), BY_NAME);
    ok(patch('record', '01', 'after', flag, 'data/seed.md'));
    const state = JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8'));
    assert.deepEqual(Object.keys(state.files), flag === '--include' ? ['data/seed.md'] : []);
  });
}
