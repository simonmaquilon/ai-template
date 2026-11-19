// What the project fingerprint of check/state.mjs reads: which refs count, and how an untracked nested repository counts.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { ROOT, run, startRepo } from './support.mjs';

const STATE = join(ROOT, '.agents', 'skills', 'prompt-plan', 'scripts', 'node', 'check-state.mjs');

async function setup(t) {
  const repo = startRepo(t);
  const plan = join(repo.dir, '.temp', 'plans', 'p');
  mkdirSync(join(plan, 'check'), { recursive: true });
  cpSync(STATE, join(plan, 'check', 'state.mjs'));
  const state = await import(pathToFileURL(join(plan, 'check', 'state.mjs')).href);
  const fingerprint = () => state.projectFingerprint(state.captureProject(repo.dir, plan));
  return { repo, plan, state, fingerprint };
}

test('prompt-plan state: remote-tracking refs and stashes leave the project fingerprint as it is, local branches and tags move it', async (t) => {
  const { repo, fingerprint } = await setup(t);
  repo.write('second.txt', 'two\n');
  for (const args of [['add', '-A'], ['commit', '-q', '-m', 'second']]) assert.equal(repo.git(...args).status, 0);
  const clean = fingerprint();
  assert.ok(clean);
  assert.equal(repo.git('update-ref', 'refs/remotes/origin/x', 'HEAD~1').status, 0);
  assert.equal(fingerprint(), clean, 'a remote-tracking ref was created');
  assert.equal(repo.git('update-ref', 'refs/remotes/origin/x', 'HEAD').status, 0);
  assert.equal(fingerprint(), clean, 'a remote-tracking ref moved');
  repo.write('kept.txt', 'work in progress\n');
  assert.equal(repo.git('stash').status, 0);
  assert.equal(repo.git('rev-parse', '--verify', 'refs/stash').status, 0);
  assert.equal(fingerprint(), clean, 'the tree is clean again and only the stash ref exists');

  assert.equal(repo.git('branch', 'other').status, 0);
  const branched = fingerprint();
  assert.notEqual(branched, clean, 'a local branch was created');
  assert.equal(repo.git('update-ref', 'refs/heads/other', 'HEAD~1').status, 0);
  const moved = fingerprint();
  assert.notEqual(moved, branched, 'a local branch moved');
  assert.equal(repo.git('tag', 'v1').status, 0);
  assert.notEqual(fingerprint(), moved, 'a tag was created');
});

test('prompt-plan state: an untracked nested repository has a stable fingerprint that follows its commits and its edits', async (t) => {
  const { repo, fingerprint } = await setup(t);
  mkdirSync(join(repo.dir, 'inner'));
  const inner = (...args) => run('git', ['-c', 'user.name=Inner', '-c', 'user.email=inner@example.invalid', '-c', 'core.autocrlf=false', '-C', join(repo.dir, 'inner'), ...args]);
  assert.equal(inner('init', '-q').status, 0);
  writeFileSync(join(repo.dir, 'inner', 'a.txt'), 'one\n');
  for (const args of [['add', '-A'], ['commit', '-q', '-m', 'one']]) assert.equal(inner(...args).status, 0);
  assert.match(repo.git('ls-files', '--others', '--exclude-standard').stdout, /^inner\/$/m, 'git lists the folder as one name');
  const first = fingerprint();
  assert.ok(first, 'the identity is no longer nulled');
  assert.equal(fingerprint(), first);
  writeFileSync(join(repo.dir, 'inner', 'a.txt'), 'edited\n');
  const dirty = fingerprint();
  assert.notEqual(dirty, first, 'an edit of the nested repository');
  assert.equal(inner('commit', '-q', '-a', '-m', 'two').status, 0);
  assert.notEqual(fingerprint(), dirty, 'a commit of the nested repository');
});
