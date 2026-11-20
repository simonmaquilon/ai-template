import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fakeGh, withEnv } from './fake-gh.mjs';
import { NOTES, release, releasable } from './release-fixture.mjs';
import { WINDOWS } from './support.mjs';

const GREEN = { runs: [{ status: 'completed', conclusion: 'success', workflowName: 'ci' }] };
const RED = { runs: [{ status: 'completed', conclusion: 'failure', workflowName: 'ci' }] };
const RUN_LIST = (sha) => ['run', 'list', '--commit', sha, '--json', 'status,conclusion,workflowName', '--limit', '100'];

test('a release from a subfolder pushes the branch, tags the verified commit in the remote, and creates the release', (t) => {
  const repo = releasable(t, '2.3.4');
  const gh = fakeGh(t, GREEN);
  mkdirSync(join(repo.dir, 'sub'));
  const result = withEnv(gh.vars, () => release(repo, ['--notes', join('..', '.temp', 'notes.md')], join(repo.dir, 'sub')));
  assert.equal(result.status, 0, result.stderr);
  const head = repo.head();
  assert.equal(repo.remoteRefs(), `refs/heads/${repo.branch()} ${head}\nrefs/tags/2.3.4 ${head}`);
  assert.equal(repo.git('rev-parse', '2.3.4^{commit}').stdout.trim(), head);
  assert.deepEqual(gh.calls(), [RUN_LIST(head), ['release', 'create', '2.3.4', '--verify-tag', '--title', '2.3.4', '--notes-file', realpathSync(NOTES(repo))]]);
  assert.match(result.stdout, /published 2\.3\.4/);
  assert.equal(result.stdout.trim().split('\n').length <= 8, true, 'one line per step');
});

test('a release publishes without waiting when no workflow is active, and says so', (t) => {
  const repo = releasable(t);
  const gh = fakeGh(t, { runs: [], workflows: [] });
  const result = withEnv(gh.vars, () => release(repo, ['--notes', NOTES(repo)]));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no active workflow/);
  assert.match(repo.remoteRefs(), /refs\/tags\/1\.0\.0 /);
  assert.deepEqual(gh.calls().map((call) => call.slice(0, 2).join(' ')), ['run list', 'workflow list', 'release create']);
});

test('a release whose CI failed leaves the branch pushed but no tag, here or in the remote, and no release', (t) => {
  const repo = releasable(t);
  const gh = fakeGh(t, RED);
  const result = withEnv(gh.vars, () => release(repo, ['--notes', NOTES(repo)]));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CI .*failed.*nothing was tagged/);
  assert.equal(repo.remoteRefs(), `refs/heads/${repo.branch()} ${repo.head()}`);
  assert.equal(repo.git('tag').stdout, '');
  assert.deepEqual(gh.calls().map((call) => call[0]), ['run']);
});

test('a release whose CI does not finish within the time limit leaves no tag, here or in the remote', (t) => {
  const repo = releasable(t);
  const gh = fakeGh(t, { runs: [{ status: 'in_progress', conclusion: '', workflowName: 'ci' }] });
  const result = withEnv(gh.vars, () => release(repo, ['--notes', NOTES(repo), '--timeout', '0.01']));
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /did not finish within 0\.01 minutes; nothing was tagged/);
  assert.equal(repo.remoteRefs(), `refs/heads/${repo.branch()} ${repo.head()}`);
  assert.equal(repo.git('tag').stdout, '');
  assert.equal(gh.calls().some((call) => call[0] === 'release'), false);
});

test('a release pushes the verified commit to the branch by its full name, even when the name starts with +', (t) => {
  const repo = releasable(t);
  repo.git('checkout', '-q', '-b', '+x');
  const gh = fakeGh(t, GREEN);
  const result = withEnv(gh.vars, () => release(repo, ['--notes', NOTES(repo)]));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(repo.remoteRefs(), `refs/heads/+x ${repo.head()}\nrefs/tags/1.0.0 ${repo.head()}`);
});

test('a release whose tag push is refused checks the remote and says the tag is not in it', { skip: WINDOWS && 'the remote hook is a shell script' }, (t) => {
  const repo = releasable(t);
  const hook = join(repo.remote, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\nwhile read old new ref; do case "$ref" in refs/tags/*) exit 1;; esac; done\n');
  chmodSync(hook, 0o755);
  const gh = fakeGh(t, GREEN);
  const result = withEnv(gh.vars, () => release(repo, ['--notes', NOTES(repo)]));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pushing tag 1\.0\.0 failed; the tag exists here and is not in origin; the release was not created/);
  assert.equal(repo.git('tag').stdout.trim(), '1.0.0');
  assert.equal(gh.calls().some((call) => call[0] === 'release'), false);
});

test('a release that fails after the tag says which of the tag, local and in the remote, was left', (t) => {
  const repo = releasable(t);
  const gh = fakeGh(t, { ...GREEN, fail: ['release create'] });
  const result = withEnv(gh.vars, () => release(repo, ['--notes', NOTES(repo)]));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /tag 1\.0\.0 exists here and in origin; the release was not created/);
  assert.match(repo.remoteRefs(), /refs\/tags\/1\.0\.0 /);
});
