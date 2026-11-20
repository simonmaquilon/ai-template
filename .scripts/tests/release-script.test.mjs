import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { fakeGh, withEnv } from './fake-gh.mjs';
import { NOTES, release, releasable } from './release-fixture.mjs';
import { commit } from './template-manifest-fixture.mjs';

const GREEN = { runs: [{ status: 'completed', conclusion: 'success' }] };

// Runs the release after `change`, and checks that it refused with the message and touched nothing: no call to gh, no ref
// in the remote, no tag here.
function refused(t, change, pattern, notes) {
  const repo = releasable(t);
  const gh = fakeGh(t, GREEN);
  change?.(repo);
  const tags = repo.git('tag').stdout;
  const result = withEnv(gh.vars, () => release(repo, ['--notes', notes ?? NOTES(repo)]));
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, pattern);
  assert.deepEqual([gh.calls(), repo.remoteRefs(), repo.git('tag').stdout], [[], '', tags]);
}

test('the release refuses outside the maintained template', (t) => {
  refused(t, (repo) => repo.git('remote', 'set-url', 'origin', 'https://example.invalid/someone/fork.git'), /maintained template/);
});

test('the release refuses a detached HEAD, an unclean tree, and a version that is not MAJOR.MINOR.PATCH', (t) => {
  refused(t, (repo) => repo.git('checkout', '-q', '--detach'), /detached/);
  refused(t, (repo) => repo.write('dirty.txt', 'x\n'), /uncommitted changes/);
});

for (const version of ['v1.0.0', '1.0', '1.0.0.1', '1.0.0-rc1', '01.0.0', '']) {
  test(`the release refuses the version "${version}"`, (t) => {
    refused(t, (repo) => {
      repo.write('.agents/template-version', `${version}\n`);
      commit(repo);
    }, /MAJOR\.MINOR\.PATCH/);
  });
}

test('the release refuses a stale manifest and says what changed', (t) => {
  refused(t, (repo) => {
    repo.write('a.txt', 'edited\n');
    commit(repo);
  }, /manifest/);
});

test('the release refuses when the tag of the version already exists here', (t) => {
  refused(t, (repo) => repo.git('tag', '1.0.0'), /tag 1\.0\.0 already exists/);
});

test('the release refuses a missing, empty, or blank notes file', (t) => {
  refused(t, undefined, /notes/, join('.temp', 'absent.md'));
  refused(t, (repo) => repo.write('.temp/empty.md', ''), /empty/, join('.temp', 'empty.md'));
  refused(t, (repo) => repo.write('.temp/blank.md', ' \n\n'), /empty/, join('.temp', 'blank.md'));
});

test('the release exits with 2 on misuse and does nothing', (t) => {
  const repo = releasable(t);
  const gh = fakeGh(t, GREEN);
  for (const args of [[], ['--notes'], ['--timeout', '5'], ['--notes', NOTES(repo), '--timeout', 'soon'], ['--notes', NOTES(repo), '--timeout', '0'],
    ['--notes', NOTES(repo), '--other'], ['--notes', NOTES(repo), 'extra']]) {
    const result = withEnv(gh.vars, () => release(repo, args));
    assert.equal(result.status, 2, `${args}: ${result.stderr}`);
    assert.match(result.stderr, /Usage: node \.scripts\/release\.mjs --notes <file> \[--timeout <minutes>\]/);
  }
  assert.deepEqual([gh.calls(), repo.remoteRefs()], [[], '']);
});
