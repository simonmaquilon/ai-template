import assert from 'node:assert/strict';
import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { protectedPaths } from '../protected-paths.mjs';
import { postToolContext } from './hook-context.mjs';
import { PROTECTED, SETTINGS, after, before, project, reason, silent } from './protected-paths-fixture.mjs';
import { WINDOWS } from './support.mjs';

const LIMIT = 1024 * 1024;
// The JSON of a settings object padded to exactly this many bytes.
const sized = (settings, bytes) => {
  const empty = JSON.stringify({ ...settings, pad: '' });
  return JSON.stringify({ ...settings, pad: 'x'.repeat(bytes - Buffer.byteLength(empty)) });
};

// What a derived project keeps in .claude/settings.local.json: its own protected paths, read like those of settings.json.
const LOCAL = { permissions: { deny: ['Edit(secrets/**)'] }, sandbox: { filesystem: { denyWrite: ['vault/', 'src'] } } };
const LOCAL_PATHS = ['secrets', 'vault', 'src'];
const MESSAGE = (path) => new RegExp(`^AGENTS\\.md: this command writes ${JSON.stringify(path)}, which the project protects `
  + '\\(permissions\\.deny or sandbox\\.filesystem\\.denyWrite in \\.claude/settings\\.json or \\.claude/settings\\.local\\.json\\); changing it needs the user\'s explicit authorization\\.$');
const withLocal = (t, local) => {
  const repo = project(t);
  repo.write('secrets/a.txt', 'a\n');
  repo.write('.claude/settings.local.json', typeof local === 'string' ? local : JSON.stringify(local));
  return repo;
};

test('the protected list is the union of settings.json and settings.local.json, which is ignored when it is missing or not JSON', () => {
  const settings = JSON.stringify(SETTINGS);
  assert.deepEqual(protectedPaths(settings, JSON.stringify(LOCAL)), [...PROTECTED, ...LOCAL_PATHS]);
  assert.deepEqual(protectedPaths('{}', JSON.stringify(LOCAL)), LOCAL_PATHS);
  for (const local of [undefined, null, '', '{ not json', 'null', '[]', '"x"', '{"permissions":1}']) assert.deepEqual(protectedPaths(settings, local), PROTECTED, String(local));
  assert.throws(() => protectedPaths('{ not json', JSON.stringify(LOCAL)));
});

for (const client of ['claude', 'codex']) {
  test(`${client}: a path only settings.local.json declares is protected before a command`, (t) => {
    const repo = withLocal(t, LOCAL);
    for (const [command, path] of [['rm secrets/a.txt', 'secrets'], ['echo x > vault/new', 'vault'], ['git checkout -- src', 'src']]) {
      assert.match(reason(client, before(client, repo, command), command), MESSAGE(path), command);
    }
    assert.match(reason(client, before(client, repo, 'rm .scripts/a.mjs'), 'settings.json'), MESSAGE('.scripts'));
    silent(before(client, repo, 'cat secrets/a.txt'), 'read');
    silent(before(client, repo, 'echo x > other/a'), 'unlisted');
  });

  test(`${client}: a path only settings.local.json declares enters the fingerprint the hook compares after a command`, (t) => {
    const repo = withLocal(t, LOCAL);
    silent(before(client, repo, 'node build.mjs'), 'before');
    repo.write('secrets/a.txt', 'changed by a program\n');
    repo.write('vault/new.txt', 'added\n');
    assert.match(postToolContext(after(client, repo, 'node build.mjs')), /secrets\/a\.txt \(changed\), vault \(added\), vault\/new\.txt \(added\)\./);
  });

  test(`${client}: a settings.local.json that is missing, unreadable, or not JSON adds nothing and warns of nothing, and settings.json still counts`, (t) => {
    for (const local of ['{ not json', '[1, 2]']) {
      const repo = withLocal(t, local);
      silent(before(client, repo, 'rm secrets/a.txt'), local);
      assert.match(reason(client, before(client, repo, 'rm docs/a.md'), local), MESSAGE('docs'));
    }
    const repo = withLocal(t, LOCAL);
    rmSync(join(repo.dir, '.claude', 'settings.local.json'));
    silent(before(client, repo, 'rm secrets/a.txt'), 'missing');
    assert.match(reason(client, before(client, repo, 'rm docs/a.md'), 'missing'), MESSAGE('docs'));
    mkdirSync(join(repo.dir, '.claude', 'settings.local.json'));
    silent(before(client, repo, 'rm secrets/a.txt'), 'a folder, so unreadable');
    assert.match(reason(client, before(client, repo, 'rm docs/a.md'), 'unreadable'), MESSAGE('docs'));
  });

  test(`${client}: a settings.local.json that is a link or over 1 MiB is ignored in silence, and one of exactly 1 MiB counts`, (t) => {
    const repo = withLocal(t, LOCAL);
    const local = join('.claude', 'settings.local.json');
    repo.write(local, sized(LOCAL, LIMIT));
    assert.match(reason(client, before(client, repo, 'rm secrets/a.txt'), 'exactly 1 MiB'), MESSAGE('secrets'));
    repo.write(local, sized(LOCAL, LIMIT + 1));
    silent(before(client, repo, 'rm secrets/a.txt'), 'over 1 MiB');
    assert.match(reason(client, before(client, repo, 'rm docs/a.md'), 'over 1 MiB'), MESSAGE('docs'));
    if (WINDOWS) return;
    rmSync(join(repo.dir, local));
    repo.write('.claude/elsewhere.json', JSON.stringify(LOCAL));
    symlinkSync('elsewhere.json', join(repo.dir, local));
    silent(before(client, repo, 'rm secrets/a.txt'), 'a link');
    assert.match(reason(client, before(client, repo, 'rm docs/a.md'), 'a link'), MESSAGE('docs'));
  });

  test(`${client}: a settings.json that is a link or over 1 MiB is unreadable, like one that is not JSON`, (t) => {
    const unreadable = /^AGENTS\.md: the protected-paths guard could not read this command or the list in \.claude\/settings\.json;/;
    const repo = withLocal(t, LOCAL);
    repo.write('.claude/settings.json', sized(SETTINGS, LIMIT + 1));
    assert.match(reason(client, before(client, repo, 'git status'), 'over 1 MiB'), unreadable);
    repo.write('.claude/settings.json', sized(SETTINGS, LIMIT));
    silent(before(client, repo, 'git status'), 'exactly 1 MiB');
    if (WINDOWS) return;
    rmSync(join(repo.dir, '.claude', 'settings.json'));
    repo.write('.claude/elsewhere.json', JSON.stringify(SETTINGS));
    symlinkSync('elsewhere.json', join(repo.dir, '.claude', 'settings.json'));
    assert.match(reason(client, before(client, repo, 'git status'), 'a link'), unreadable);
  });

  test(`${client}: a settings.json that is not JSON still makes the hook say so, whatever settings.local.json holds`, (t) => {
    const repo = withLocal(t, LOCAL);
    repo.write('.claude/settings.json', '{ not json');
    assert.match(reason(client, before(client, repo, 'git status'), 'invalid'), /^AGENTS\.md: the protected-paths guard could not read this command or the list in \.claude\/settings\.json;/);
  });
}
