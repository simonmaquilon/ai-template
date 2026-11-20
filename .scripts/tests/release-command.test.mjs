import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseCommands } from '../release-command.mjs';
import { releaseTargets } from '../release-target.mjs';
import { makeRepo } from './support.mjs';

// A repository whose tag v1 (lightweight) and v2 (annotated) name the first commit while HEAD is the second.
function tagged(t) {
  const repo = makeRepo(t);
  const commit = (name) => {
    repo.write(`${name}.txt`, `${name}\n`);
    repo.git('add', '-A');
    repo.git('commit', '-q', '-m', name);
    return repo.git('rev-parse', 'HEAD').stdout.trim();
  };
  const first = commit('first');
  repo.git('tag', 'v1');
  repo.git('tag', '-a', 'v2', '-m', 'annotated');
  return { repo, first, head: (commit('second'), repo.git('rev-parse', 'HEAD').stdout.trim()) };
}

// What the command publishes, as "kind name commit" lines, the commit named first or head.
function found({ repo, first, head }, command, options = {}) {
  const named = (sha) => (sha === first ? 'first' : sha === head ? 'head' : sha);
  const list = releaseTargets(releaseCommands(command, { readings: [false], cwd: repo.dir, ...options }));
  return list.map(({ kind, name, sha }) => `${kind} ${name} ${named(sha)}`);
}

test('a git push publishes a tag by option, by refspec, by the tag form, or by a name that is a local tag', (t) => {
  const repo = tagged(t);
  const cases = {
    'git push --tags': ['push null head'], 'git push origin --follow-tags': ['push null head'], 'git push --mirror': ['push null head'],
    'git push --tag': ['push null head'], 'git push --follow origin main': ['push null head'],
    'git push origin refs/tags/v1': ['push v1 first'], 'git push origin +refs/tags/v1:refs/tags/v1': ['push v1 first'],
    'git push origin tag v1': ['push v1 first'], 'git push origin v1': ['push v1 first'], 'git push -u origin main v2': ['push v2 first'],
    'git push origin HEAD:refs/tags/v9': ['push v9 head'], 'git push origin v1:refs/tags/v9': ['push v9 first'],
    'git push origin tags/v1': ['push v1 first'], 'git push origin +tags/v2': ['push v2 first'], 'git push origin tags/v1:tags/v8': ['push v1 first'],
    'git push origin v1 refs/tags/v2': ['push v1 first', 'push v2 first'], 'git push -o ci.skip origin v1': ['push v1 first'],
    "sh -c 'git push --tags'": ['push null head'], 'git -c core.pager=cat push origin v1': ['push v1 first'],
  };
  for (const [command, expected] of Object.entries(cases)) assert.deepEqual(found(repo, command), expected, command);
});

test('a git push that publishes no tag, or deletes one, is not a finding', (t) => {
  const repo = tagged(t);
  for (const command of ['git push', 'git push origin main', 'git push origin HEAD', 'git push -u origin feature', 'git push origin nothing',
    'git push origin :v1', 'git push origin --delete v1', 'git push -d origin v1', 'git push --dele origin refs/tags/v1', 'git push --dry-run origin main',
    'git push --no-tags', 'git status', 'git tag v9', "git commit -m 'git push --tags'", 'echo git push --tags']) {
    assert.deepEqual(found(repo, command), [], command);
  }
});

test('gh release create and its alias new name the release, and its commit is the tag, the target, or HEAD', (t) => {
  const repo = tagged(t);
  const cases = {
    'gh release create v1': ['release v1 first'], 'gh release new v9': ['release v9 head'], 'gh release create v1 dist/a.zip': ['release v1 first'],
    [`gh release create v9 --target ${repo.first}`]: ['release v9 first'], [`gh release create v9 --target=${repo.first}`]: ['release v9 first'],
    'gh release create v9 --target nowhere': ['release v9 head'], [`gh release create v1 --target ${repo.head}`]: ['release v1 first'],
    'gh -R owner/repo release create v9 --title "A title" --notes-file n.md --verify-tag': ['release v9 head'],
    'gh release create v9 -t Title -n Notes --draft': ['release v9 head'],
  };
  for (const [command, expected] of Object.entries(cases)) assert.deepEqual(found(repo, command), expected, command);
  for (const command of ['gh release create', 'gh release list', 'gh release view v1', 'gh release delete v1', 'gh pr create', 'gh release']) {
    assert.deepEqual(found(repo, command), [], command);
  }
});

test('the reading covers an argument list, PowerShell quoting, a folder named by -C, and a commit that cannot be resolved', (t) => {
  const repo = tagged(t);
  assert.deepEqual(found(repo, ['git', 'push', 'origin', 'refs/tags/v1']), ['push v1 first']);
  assert.deepEqual(found(repo, ['gh', 'release', 'create', 'v1']), ['release v1 first']);
  assert.deepEqual(found(repo, 'git push origin refs/tags/v1', { readings: [true] }), ['push v1 first']);
  assert.deepEqual(found(repo, 'git commit -m @\'\ngit push --tags\n\'@', { readings: [true] }), []);
  const other = tagged(t);
  const there = `'${other.repo.dir.replaceAll('\\', '/')}'`;
  assert.deepEqual(found(other, `git -C ${there} push origin v2`, { cwd: repo.repo.dir }), ['push v2 first']);
  assert.deepEqual(found(other, `cd ${there} && gh release create v1`, { cwd: repo.repo.dir }), ['release v1 first']);
  const unborn = releaseTargets(releaseCommands('git push --tags', { readings: [false], cwd: makeRepo(t).dir }));
  assert.deepEqual(unborn, [{ kind: 'push', name: null, sha: null }]);
});

test('a command nested too deep to read throws', (t) => {
  const { repo } = tagged(t);
  const command = `${'echo "$('.repeat(4000)}x${')"'.repeat(4000)}`;
  assert.throws(() => releaseCommands(command, { readings: [false], cwd: repo.dir }));
});
