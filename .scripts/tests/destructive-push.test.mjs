import assert from 'node:assert/strict';
import test from 'node:test';
import { destructivePush } from '../destructive-push.mjs';
import { makeRepo } from './support.mjs';

// Commands that overwrite or delete remote refs, each with what the reason must name.
const FOUND = [
  ['git push --force', /uses --force/], ['git push origin main --force-with-lease', /--force-with-lease/],
  ['git push --force-with-lease=main:abc origin main', /--force-with-lease=main:abc/], ['git push --force-if-includes origin main', /--force-if-includes/],
  ['git push --delete origin old', /--delete/], ['git push --mirror bk', /--mirror/], ['git push --prune origin', /--prune/],
  ['git push --de origin old', /--de\b/], ['git push --m bk', /--m\b/], ['git push --pru origin', /--pru\b/], ['git push --fo origin main', /--fo\b/],
  ['git push --force-w origin main', /--force-w\b/],
  ['git push -f', /uses -f/], ['git push -uf origin main', /-uf/], ['git push -vfd origin old', /-vfd/], ['git push -qd origin old', /-qd/],
  ['git push -d origin old', /-d/], ['git push -o ci.skip -f origin main', /-f/], ['git push -fo ci.skip origin main', /-fo/],
  ['git push origin +main', /forces main with \+main/], ['git push origin "+main"', /\+main/], ["git push origin '+main'", /\+main/],
  ['git push origin ":old"', /deletes old with :old/], ["git push origin ':old'", /:old/], ['git push origin \\:old', /:old/],
  ['git push origin HEAD:main +x', /\+x/], ['git push origin main :old', /:old/],
  ['git -c remote.bk.mirror=true push bk', /remote\.bk\.mirror/], ['git -c remote.bk.mirror=1 push bk', /remote\.bk\.mirror/],
  ['git -c REMOTE.bk.MIRROR=yes push bk', /REMOTE\.bk\.MIRROR/], ['git -c remote.origin.push=+refs/heads/*:refs/heads/* push', /remote\.origin\.push/],
  ['git --config-env=remote.bk.mirror=MIRROR push bk', /remote\.bk\.mirror/], ['git --config-env remote.bk.push=PUSH push bk', /remote\.bk\.push/],
  ['GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=remote.bk.mirror GIT_CONFIG_VALUE_0=true git push bk', /sets git configuration inline/],
  ['GIT_CONFIG_PARAMETERS="\'remote.bk.mirror=true\'" git push bk', /sets git configuration inline/], ['env GIT_CONFIG_KEY_0=x git push', /inline/],
  ['git -C sub push -f', /-f/], ['git --no-pager -c core.pager=cat push --force', /--force/], ['cd sub && git push --force', /--force/],
  ["sh -c 'git push --force'", /--force/], ['bash -lc "git push origin +main"', /\+main/], ['echo ok; git push -f', /-f/], ['git pf', /--force/],
  ['git -c alias.pd="push --delete" pd origin old', /--delete/], ['/usr/bin/git push -f', /-f/], ['sudo git push --force', /--force/],
  ['git status && git push origin :old', /:old/],
  ['git -c remote.origin.push=:refs/heads/old push', /remote\.origin\.push/], ['git -c remote.bk.mirror=0x1 push bk', /remote\.bk\.mirror/],
  ['git -c remote.bk.mirror=2k push bk', /remote\.bk\.mirror/], ['git -c remote.bk.mirror push bk', /remote\.bk\.mirror/],
  ['git push origin +:', /forces : with \+:/], ['git -c remote.origin.mirror=true p', /remote\.origin\.mirror/],
  ['git -c remote.origin.mirror=true status', /remote\.origin\.mirror/],
  ['export GIT_CONFIG_COUNT=1; git push', /sets git configuration inline/], ['declare -x GIT_CONFIG_COUNT=1; git push', /inline/],
  ['$env:GIT_CONFIG_COUNT = 1; git push', /inline/], ['GIT_CONFIG_GLOBAL=x git push', /inline/], ['GIT_CONFIG_SYSTEM=x git push', /inline/],
  ['git -c include.path=x push', /include\.path/], ['git -c includeIf.gitdir:/a/.path=x push', /includeIf/], ['git -c INCLUDE.PATH=x push', /INCLUDE\.PATH/],
  ['git --config-env=include.path=V push', /include\.path/],
  ['git --attr-source HEAD push --force', /--force/], ['timeout 60 git push -f', /-f/], ['timeout -s KILL 5 git push -f', /-f/],
  ['nice -n 10 git push -f', /-f/], ['stdbuf -oL git push -f', /-f/], ['stdbuf -o L git push -f', /-f/], ['git push -- origin +main', /\+main/], ['git push --repo=bk origin +main', /\+main/],
];
// Pushes that only add, and commands that do not push.
const SILENT = [
  'git push', 'git push origin main', 'git push -u origin feature', 'git push origin v1', 'git push --tags', 'git push --follow-tags',
  'git push --dry-run', 'git push origin HEAD:main', 'git push -o ci.skip origin main', 'git push -of origin main', 'git push -n origin main',
  'git push --set-upstream origin x', 'git push --push-option -f origin main', 'git push --push-option=-f origin main', 'git push --no-force-with-lease',
  'git push --recurse-submodules=on-demand', 'git push -- origin main', 'git push origin -- --force', 'git -c user.name=x push origin main',
  'git -c remote.origin.mirror=false push', 'git -c remote.origin.push=refs/heads/x push', 'GIT_AUTHOR_NAME=x git push origin main',
  'git push origin :', 'git push --recurse-submodules check origin main', 'git push --rec check origin main', 'git -c remote.origin.mirror=0 push',
  'git -c remote.origin.mirror= push', 'git -c remote.origin.push=: push', 'GIT_CONFIG_NOSYSTEM=1 git push', 'timeout 60 git push origin main',
  'nice -n 10 git push', 'git --attr-source HEAD push origin main',
  'git status', 'git pull --force', 'git fetch -f', 'git stash push -f', 'git commit -m "git push --force"', 'echo git push --force',
  "git commit -m 'git push origin +main'", 'git log --oneline origin/main..main', '# git push --force', "echo ':old' +main", 'git pushd -f',
];

test('the destructive-push guard finds pushes that overwrite or delete remote refs, however they are written', (t) => {
  const repo = makeRepo(t);
  repo.git('config', 'alias.pf', 'push --force');
  repo.git('config', 'alias.p', 'push');
  const reason = (command, readings = [false]) => destructivePush(command, { readings, cwd: repo.dir });
  for (const [command, expected] of FOUND) {
    assert.match(reason(command) ?? '', expected, command);
    assert.match(reason(command, [true, false]) ?? '', expected, `${command} (--powershell)`);
  }
  for (const command of SILENT) {
    assert.equal(reason(command), null, command);
    assert.equal(reason(command, [true, false]), null, `${command} (--powershell)`);
  }
  assert.match(reason(['git', 'push', '-uf', 'origin', 'main']), /-uf/);
  assert.equal(reason(['git', 'push', 'origin', 'main']), null);
  assert.equal(reason(undefined), null);
});

test('the destructive-push guard reads a nested command only down to a limit', (t) => {
  const repo = makeRepo(t);
  const nested = `${'echo "$('.repeat(4000)}x${')"'.repeat(4000)}`;
  assert.throws(() => destructivePush(nested, { readings: [false], cwd: repo.dir }));
});
