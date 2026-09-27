import assert from 'node:assert/strict';
import { readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, hookFor, makeRepo, runClientHook } from './support.mjs';

const input = (dir, id, command) => ({ session_id: 'session', tool_use_id: id, cwd: dir, tool_input: { command } });
const hook = (client, event, repo, id, command, dir = repo.dir) =>
  runClientHook(client, hookFor(client, event, 'check-staging-effect.mjs'), repo, { input: input(dir, id, command) });
const before = (client, repo, id, command, dir) => hook(client, 'PreToolUse', repo, id, command, dir);
const after = (client, repo, id, command, dir) => hook(client, 'PostToolUse', repo, id, command, dir);

// Runs a tool call: the before hook, what the command did, and the after hook.
function call(client, repo, id, command, effect, dir) {
  assert.equal(before(client, repo, id, command, dir).status, 0);
  effect();
  return after(client, repo, id, command, dir);
}

function baseRepo(t) {
  const repo = makeRepo(t);
  repo.write('base.txt', 'base\n');
  repo.git('add', '--', '.gitignore', 'base.txt');
  repo.git('commit', '-q', '-m', 'base');
  return repo;
}

for (const client of ['claude', 'codex']) {
  test(`${client}: the effect hook reports paths a command staged or committed without naming them`, (t) => {
    const repo = baseRepo(t);
    for (const path of ['a.txt', 'b.txt', 'c.txt', 'src/x.ts', 'src/deep/y.ts', 'z.txt']) repo.write(path, `${path}\n`);
    assert.equal(call(client, repo, 'named', 'git add a.txt', () => repo.git('add', '--', 'a.txt')).status, 0);
    assert.equal(call(client, repo, 'glob', "git add 'src/*.ts'", () => repo.git('add', '--', 'src')).status, 0);
    assert.equal(call(client, repo, 'shell', "bash -c 'git add z.txt'", () => repo.git('add', '--', 'z.txt')).status, 0);
    const hidden = call(client, repo, 'hidden', 'python tools/stage.py', () => repo.git('add', '--', 'b.txt'));
    assert.equal(hidden.status, 2);
    assert.match(hidden.stderr, /27-version-control\.md: this command staged paths it does not name: b\.txt\. Unstage them/);
    repo.git('restore', '--staged', '--', 'b.txt');
    const commit = () => {
      repo.git('add', '--', 'c.txt');
      repo.git('commit', '-q', '-m', 'c');
    };
    const committed = call(client, repo, 'commit', 'python tools/commit.py', commit);
    assert.equal(committed.status, 2);
    assert.match(committed.stderr, /committed [0-9a-f]{7} with paths it neither names nor had staged: c\.txt\. Report the commit/);
    assert.equal(call(client, repo, 'reset', 'git reset --soft HEAD~1', () => repo.git('reset', '-q', '--soft', 'HEAD~1')).status, 0);
    const records = join(repo.dir, '.temp', 'check-staging-effect');
    assert.ok(readdirSync(records).every((name) => JSON.parse(readFileSync(join(records, name), 'utf8')).ended));
  });

  test(`${client}: the effect hook leaves overlapping calls, HEAD moves, stash, and blocked commands alone`, (t) => {
    const repo = baseRepo(t);
    repo.git('branch', 'ahead');
    repo.git('checkout', '-q', 'ahead');
    repo.write('ahead.txt', 'ahead\n');
    repo.git('add', '--', 'ahead.txt');
    repo.git('commit', '-q', '-m', 'ahead');
    repo.git('checkout', '-q', '-');
    const branch = () => repo.git('checkout', '-q', 'ahead');
    assert.equal(call(client, repo, 'checkout', 'git checkout ahead', branch).status, 0);
    repo.git('checkout', '-q', '-');
    assert.equal(call(client, repo, 'merge', 'git merge --ff-only ahead', () => repo.git('merge', '-q', '--ff-only', 'ahead')).status, 0);
    repo.write('d.txt', 'd\n');
    assert.equal(before(client, repo, 'slow', 'npm test').status, 0);
    assert.equal(call(client, repo, 'fast', 'git add d.txt', () => repo.git('add', '--', 'd.txt')).status, 0);
    assert.equal(after(client, repo, 'slow', 'npm test').status, 0);
    repo.write('e.txt', 'e\n');
    repo.git('add', '--', 'e.txt');
    repo.git('stash', 'push', '-q');
    assert.equal(call(client, repo, 'stash', 'git stash pop', () => repo.git('stash', 'pop', '--index', '-q')).status, 0);
    assert.equal(before(client, repo, 'blocked', 'git add -A').status, 0);
    const records = readdirSync(join(repo.dir, '.temp', 'check-staging-effect'));
    assert.ok(!records.includes('blocked.json'));
  });
}

test('claude: the effect hook also runs after a command that fails', () => {
  assert.ok(hookFor('claude', 'PostToolUseFailure', 'check-staging-effect.mjs'));
});

test('the effect hook resolves a working directory reached through a link', (t) => {
  const repo = baseRepo(t);
  repo.write('src/f.txt', 'f\n');
  const link = `${repo.dir}-link`;
  t.after(() => rmSync(link, { force: true }));
  try {
    symlinkSync(repo.dir, link, WINDOWS ? 'junction' : 'dir');
  } catch (error) {
    t.skip(`cannot create a directory link: ${error.code}`);
    return;
  }
  assert.equal(call('claude', repo, 'linked', 'git add src/f.txt', () => repo.git('add', '--', 'src/f.txt'), link).status, 0);
});
