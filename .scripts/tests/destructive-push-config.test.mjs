import assert from 'node:assert/strict';
import { relative } from 'node:path';
import test from 'node:test';
import { destructivePush } from '../destructive-push.mjs';
import { commands } from '../shell-commands.mjs';
import { makeRepo } from './support.mjs';

const URL = 'https://example.invalid/a.git';

// A repository with the remotes origin and bk, on the branch it starts on.
function remotes(t) {
  const repo = makeRepo(t);
  repo.git('remote', 'add', 'origin', URL);
  repo.git('remote', 'add', 'bk', URL);
  const branch = repo.git('symbolic-ref', '--short', 'HEAD').stdout.trim();
  const reason = (command, cwd = repo.dir) => destructivePush(command, { readings: [false], cwd });
  return { repo, branch, reason };
}

test('the destructive-push guard reads a mirror remote from the configuration of the remote the push targets', (t) => {
  const { repo, reason } = remotes(t);
  repo.git('config', 'remote.bk.mirror', 'true');
  assert.match(reason('git push bk'), /pushes to remote bk, configured as a mirror/);
  assert.match(reason('git push bk main'), /remote bk/);
  assert.equal(reason('git push origin'), null);
  assert.equal(reason('git push'), null);
  assert.equal(reason(`git push ${URL}`), null);
  assert.match(reason('git push --repo bk'), /remote bk/);
});

test('the destructive-push guard resolves the remote of a push without one as git does', (t) => {
  const { repo, branch, reason } = remotes(t);
  repo.git('config', 'remote.bk.mirror', 'true');
  repo.git('config', 'remote.pushDefault', 'bk');
  assert.match(reason('git push'), /remote bk/);
  repo.git('config', '--unset', 'remote.pushDefault');
  assert.equal(reason('git push'), null);
  repo.git('config', `branch.${branch}.remote`, 'bk');
  assert.match(reason('git push'), /remote bk/);
  repo.git('config', `branch.${branch}.pushRemote`, 'origin');
  assert.equal(reason('git push'), null);
  repo.git('config', 'remote.origin.mirror', 'true');
  assert.match(reason('git push'), /remote origin/);
});

test('the destructive-push guard reads a forced refspec configured on the remote only for a push without a refspec', (t) => {
  const { repo, reason } = remotes(t);
  repo.git('config', '--add', 'remote.origin.push', 'refs/heads/safe:refs/heads/safe');
  assert.equal(reason('git push'), null);
  repo.git('config', '--add', 'remote.origin.push', '+refs/heads/*:refs/heads/*');
  assert.match(reason('git push'), /remote origin, configured with a refspec that forces or deletes/);
  assert.match(reason('git push origin'), /remote origin/);
  assert.equal(reason('git push origin main'), null);
  assert.equal(reason('git push bk'), null);
  assert.equal(reason(`git push ${URL}`), null);
});

test('the destructive-push guard reads the configuration where the push runs, from -C or the working directory', (t) => {
  const { repo, reason } = remotes(t);
  const other = remotes(t);
  other.repo.git('config', 'remote.origin.mirror', 'true');
  assert.equal(reason('git push'), null);
  assert.match(reason(`git -C '${other.repo.dir}' push`), /remote origin/);
  assert.match(reason('git push', other.repo.dir), /remote origin/);
  assert.equal(reason(`git -C '${repo.dir}' push`, other.repo.dir), null);
});

test('the destructive-push guard reads a refspec configured to delete and a mirror written as git reads a true value', (t) => {
  const { repo, reason } = remotes(t);
  repo.git('config', 'remote.bk.push', ':');
  assert.equal(reason('git push bk'), null);
  repo.git('config', 'remote.bk.push', ':refs/heads/old2');
  assert.match(reason('git push bk'), /remote bk, configured with a refspec that forces or deletes/);
  assert.equal(reason('git push bk main'), null);
  repo.git('config', '--unset', 'remote.bk.push');
  for (const value of ['0x1', '2k', 'yes']) {
    repo.git('config', 'remote.bk.mirror', value);
    assert.match(reason('git push bk'), /remote bk, configured as a mirror/, value);
  }
  for (const value of ['0', 'no', 'false']) {
    repo.git('config', 'remote.bk.mirror', value);
    assert.equal(reason('git push bk'), null, value);
  }
});

test('the destructive-push guard skips the value of --recurse-submodules and prefers a repository argument to --repo', (t) => {
  const { repo, reason } = remotes(t);
  repo.git('config', 'remote.bk.mirror', 'true');
  assert.match(reason('git push --dry-run --recurse-submodules check bk'), /remote bk/);
  assert.match(reason('git push --rec check bk'), /remote bk/);
  assert.equal(reason('git push --recurse-submodules check origin'), null);
  assert.equal(reason('git push --repo=bk origin'), null);
  repo.git('config', 'remote.origin.mirror', 'true');
  assert.match(reason('git push --repo=bk origin'), /remote origin/);
});

// Bash, Claude Code's shell on Windows as well, reads an unquoted backslash as an escape, so a Windows path reaches
// the guard intact only quoted, or through the PowerShell reading the PowerShell tool gets.
test('the destructive-push guard reads an unquoted Windows path as bash does, without its backslashes', () => {
  assert.deepEqual(commands('cd C:\\x\\y').map((c) => c.words), [['cd', 'C:xy']]);
  assert.deepEqual(commands("cd 'C:\\x\\y'").map((c) => c.words), [['cd', 'C:\\x\\y']]);
  assert.deepEqual(commands('Set-Location C:\\x\\y', { powershell: true }).map((c) => c.words), [['Set-Location', 'C:\\x\\y']]);
});

test('the destructive-push guard also reads the configuration of the folders the command changes into', (t) => {
  const { repo, reason } = remotes(t);
  const other = remotes(t);
  other.repo.git('config', 'remote.origin.mirror', 'true');
  assert.match(reason(`cd '${other.repo.dir}' && git push`), /remote origin/);
  assert.match(reason(`cd '${relative(repo.dir, other.repo.dir)}' && git push`), /remote origin/);
  assert.match(reason(`pushd '${other.repo.dir}'; git push`), /remote origin/);
  assert.match(destructivePush(`(Set-Location ${other.repo.dir}; git push)`, { readings: [true], cwd: repo.dir }), /remote origin/);
  assert.equal(reason(`cd '${repo.dir}' && git push`), null);
  assert.equal(reason(`cd '${other.repo.dir}' && git status`), null);
});
