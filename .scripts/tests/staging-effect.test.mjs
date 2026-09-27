import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { hookFor, makeRepo, runClientHook } from './support.mjs';

const input = (repo, id, command) => ({ session_id: 'session', tool_use_id: id, cwd: repo.dir, tool_input: { command } });
const before = (client, repo, id, command) => runClientHook(client, hookFor(client, 'PreToolUse', 'check-staging-effect.mjs'), repo, { input: input(repo, id, command) });
const after = (client, repo, id, command) => runClientHook(client, hookFor(client, 'PostToolUse', 'check-staging-effect.mjs'), repo, { input: input(repo, id, command) });

// Runs a tool call: the before hook, what the command did, and the after hook.
function call(client, repo, id, command, effect) {
  assert.equal(before(client, repo, id, command).status, 0);
  effect();
  return after(client, repo, id, command);
}

for (const client of ['claude', 'codex']) {
  test(`${client}: the effect hook reports paths a command staged or committed without naming them`, (t) => {
    const repo = makeRepo(t);
    repo.write('base.txt', 'base\n');
    repo.git('add', '--', '.gitignore', 'base.txt');
    repo.git('commit', '-q', '-m', 'base');
    for (const path of ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'src/x.txt']) repo.write(path, `${path}\n`);
    assert.equal(call(client, repo, 'named', 'git add a.txt', () => repo.git('add', '--', 'a.txt')).status, 0);
    assert.equal(call(client, repo, 'directory', 'git add src', () => repo.git('add', '--', 'src')).status, 0);
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
    assert.equal(before(client, repo, 'first', 'git add d.txt').status, 0);
    assert.equal(call(client, repo, 'second', 'python tools/other.py', () => repo.git('add', '--', 'd.txt')).status, 0);
    assert.equal(after(client, repo, 'first', 'git add d.txt').status, 0);
    const records = join(repo.dir, '.temp', 'check-staging-effect');
    assert.deepEqual(existsSync(records) ? readdirSync(records) : [], []);
  });
}

test('claude: the effect hook also runs after a command that fails', () => {
  assert.ok(hookFor('claude', 'PostToolUseFailure', 'check-staging-effect.mjs'));
});
