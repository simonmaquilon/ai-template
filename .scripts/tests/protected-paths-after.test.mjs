import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, hookFor, runClientHook } from './support.mjs';
import { postToolContext } from './hook-context.mjs';
import { after, before, project, silent } from './protected-paths-fixture.mjs';

const state = (repo) => join(repo.dir, '.temp', 'protected-paths');
const link = (t, target, path) => {
  try {
    symlinkSync(target, path, WINDOWS ? 'junction' : 'dir');
    return true;
  } catch (error) {
    t.skip(`cannot create a link: ${error.code}`);
    return false;
  }
};

for (const client of ['claude', 'codex']) {
  test(`${client}: after a shell command the hook names the protected paths it changed, added, or removed, and restores nothing`, (t) => {
    const repo = project(t);
    silent(before(client, repo, 'node build.mjs'), 'before');
    repo.write('docs/a.md', 'changed by a program\n');
    repo.write('.codex/new.json', '{}\n');
    rmSync(join(repo.dir, 'config', 'a.json'));
    const context = postToolContext(after(client, repo, 'node build.mjs'));
    assert.match(context, /^AGENTS\.md: the shell command that just ran changed paths this project protects: /);
    assert.match(context, /\.codex\/new\.json \(added\), config\/a\.json \(removed\), docs\/a\.md \(changed\)\./);
    assert.match(context, /do not restore or delete them/);
    assert.equal(readFileSync(join(repo.dir, 'docs', 'a.md'), 'utf8'), 'changed by a program\n');
    assert.equal(existsSync(join(repo.dir, '.codex', 'new.json')), true);
    assert.equal(existsSync(join(repo.dir, 'config', 'a.json')), false);
    assert.deepEqual(readdirSync(state(repo)), []);
  });

  test(`${client}: after a command that changed nothing protected, or one the hook did not see begin, it stays silent`, (t) => {
    const repo = project(t);
    silent(before(client, repo, 'ls'), 'before');
    repo.write('src/a.ts', 'not protected\n');
    repo.write('.temp/cache.txt', 'not protected\n');
    silent(after(client, repo, 'ls'), 'unchanged');
    repo.write('docs/a.md', 'changed\n');
    silent(after(client, repo, 'ls'), 'no fingerprint left');
    silent(before(client, repo, 'ls', { tool_use_id: 't2' }), 'second before');
    repo.write('docs/a.md', 'changed again\n');
    silent(after(client, repo, 'ls', { tool_use_id: 't3' }), 'another call');
    silent(after(client, repo, 'ls', { session_id: undefined, tool_use_id: undefined }), 'no ids');
    assert.match(postToolContext(after(client, repo, 'ls', { tool_use_id: 't2' })), /docs\/a\.md \(changed\)/);
  });

  test(`${client}: it pairs the two hooks by session alone when the client sends no tool call id, and names at most 25 paths`, (t) => {
    const repo = project(t);
    silent(before(client, repo, 'make', { tool_use_id: undefined }), 'before');
    for (let i = 0; i < 30; i++) repo.write(`docs/n${String(i).padStart(2, '0')}.md`, 'new\n');
    const context = postToolContext(after(client, repo, 'make', { tool_use_id: undefined }));
    assert.match(context, /docs\/n24\.md \(added\), and 5 more\./);
    assert.doesNotMatch(context, /n25/);
  });

  test(`${client}: it keeps a fingerprint only for a command it let through, and clears the day-old ones`, (t) => {
    const repo = project(t);
    const blocked = before(client, repo, 'rm docs/a.md');
    assert.notEqual(blocked.stdout + blocked.stderr, '');
    assert.equal(existsSync(state(repo)), false);
    silent(before(client, repo, 'ls', { tool_use_id: 'old' }), 'old');
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    utimesSync(join(state(repo), 's1-old'), old, old);
    silent(before(client, repo, 'ls', { tool_use_id: 'new' }), 'new');
    assert.deepEqual(readdirSync(state(repo)), ['s1-new']);
  });
}

test('claude: a command that fails fires PostToolUseFailure, where the hook reports the change under that event name', (t) => {
  const repo = project(t);
  const fail = (input) => runClientHook('claude', hookFor('claude', 'PostToolUseFailure', 'check-protected-paths.mjs'), repo,
    { input: { cwd: repo.dir, tool_name: 'Bash', tool_input: { command: 'false' }, session_id: 's1', tool_use_id: 't1', ...input } });
  silent(before('claude', repo, 'node build.mjs; false'), 'before');
  repo.write('docs/a.md', 'changed before the command failed\n');
  const result = fail({ hook_event_name: 'PostToolUseFailure', error: 'Exit code 1' });
  assert.equal(result.status, 0, result.stderr);
  const { hookEventName, additionalContext } = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(hookEventName, 'PostToolUseFailure');
  assert.match(additionalContext, /docs\/a\.md \(changed\)/);
  assert.deepEqual(readdirSync(state(repo)), []);
  silent(fail({ hook_event_name: 'PostToolUseFailure' }), 'nothing left to compare');
  assert.equal(postToolContext(after('claude', repo, 'ls', { tool_use_id: 'none' })), '');
});

test('the fingerprint file is never written through a link a sandboxed command left in .temp', (t) => {
  const repo = project(t);
  repo.write('victims/target.txt', 'protected\n');
  mkdirSync(state(repo), { recursive: true });
  if (!link(t, join(repo.dir, 'victims', 'target.txt'), join(state(repo), 's1-t1'))) return;
  silent(before('claude', repo, 'ls'), 'file link');
  assert.equal(readFileSync(join(repo.dir, 'victims', 'target.txt'), 'utf8'), 'protected\n');
  rmSync(state(repo), { recursive: true, force: true });
  if (!link(t, join(repo.dir, 'victims'), state(repo))) return;
  silent(before('claude', repo, 'ls'), 'folder link');
  assert.deepEqual(readdirSync(join(repo.dir, 'victims')), ['target.txt']);
});

test('a fingerprint that is not one is dropped without a word', (t) => {
  const repo = project(t);
  mkdirSync(state(repo), { recursive: true });
  writeFileSync(join(state(repo), 's1-t1'), 'not json');
  silent(after('claude', repo, 'ls'), 'garbage');
});
