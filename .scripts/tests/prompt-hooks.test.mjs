import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { hookFor, makeRepo, numbered, ruleHooks, run, runClientHook } from './support.mjs';

const EVENTS = ['PreToolUse', 'UserPromptSubmit', 'PostToolUse', 'Stop'];

for (const client of ['claude', 'codex']) {
  test(`${client}: the empty-directory hook reports empty directories git does not ignore`, (t) => {
    const repo = makeRepo(t);
    mkdirSync(join(repo.dir, 'empty', 'inner'), { recursive: true });
    mkdirSync(join(repo.dir, '.temp', 'ignored-empty'), { recursive: true });
    repo.write('sub/keep.txt', 'kept\n');
    const hook = hookFor(client, 'UserPromptSubmit', 'check-empty-dirs.mjs');
    const result = runClientHook(client, hook, repo, { cwd: join(repo.dir, 'sub') });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /05-repo-layout\.md/);
    assert.match(result.stdout, /\.\/empty\/inner/);
    assert.doesNotMatch(result.stdout, /ignored-empty/);
  });

  test(`${client}: the link hook reports broken links with forward slashes`, (t) => {
    const repo = makeRepo(t);
    repo.write('README.md', '[missing](missing.md)\n');
    repo.write('.readme/10-guide.md', '[gone](gone.md)\n');
    repo.write('sub/keep.txt', 'kept\n');
    const hook = hookFor(client, 'UserPromptSubmit', 'check-doc-links.mjs');
    const result = runClientHook(client, hook, repo, { cwd: join(repo.dir, 'sub') });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /README\.md -> missing\.md/);
    assert.match(result.stdout, /\.readme\/10-guide\.md -> gone\.md/);
  });

  test(`${client}: the link hook reports a numbered file cited by a name that no longer exists`, (t) => {
    const repo = makeRepo(t);
    repo.write('.readme/10-guide.md', 'Guide.\n');
    repo.write('.agents/instructions/02-rule.md', 'Follow `10-guide.md`, `03-retired.md`, and `104-retired.md`.\n');
    const result = runClientHook(client, hookFor(client, 'UserPromptSubmit', 'check-doc-links.mjs'), repo);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\.agents\/instructions\/02-rule\.md -> 03-retired\.md/);
    assert.match(result.stdout, /02-rule\.md -> 104-retired\.md/);
    assert.doesNotMatch(result.stdout, /10-guide\.md/);
  });

  test(`${client}: the instruction hook reports unrouted and oversized instruction files`, (t) => {
    const repo = makeRepo(t);
    repo.write('AGENTS.md', '- `01-meta.md`: meta.\n- `02-long.md`: long.\n- `100-wide.md`: wide.\n');
    repo.write('.agents/instructions/100-wide.md', '# Wide\n');
    repo.write('.agents/instructions/01-meta.md', '# Meta\n');
    repo.write('.agents/instructions/02-long.md', numbered(26));
    repo.write('.agents/instructions/03-unrouted.md', '# Unrouted\n');
    repo.write('sub/keep.txt', 'kept\n');
    const hook = hookFor(client, 'UserPromptSubmit', 'check-instructions.mjs');
    const result = runClientHook(client, hook, repo, { cwd: join(repo.dir, 'sub') });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /01-meta-guidelines\.md\): 03-unrouted\.md/);
    assert.match(result.stdout, /02-long\.md \(26 lines\)/);
    assert.doesNotMatch(result.stdout, /01-meta\.md|100-wide\.md/);
  });

  test(`${client}: the symlink hook reports a tracked link checked out as a plain file`, (t) => {
    const repo = makeRepo(t);
    const hook = hookFor(client, 'UserPromptSubmit', 'check-symlinks.mjs');
    assert.equal(runClientHook(client, hook, repo).stdout, '');
    const blob = run('git', ['hash-object', '-w', '--stdin'], { cwd: repo.dir, input: 'target' }).stdout.trim();
    repo.git('update-index', '--add', '--cacheinfo', `120000,${blob},skills-link`);
    repo.write('skills-link', 'target');
    const result = runClientHook(client, hook, repo);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /28-agent-tooling-configuration\.md\): skills-link/);
  });

  test(`${client}: every rule hook exits cleanly from a subdirectory on an empty input`, (t) => {
    const repo = makeRepo(t);
    repo.write('sub/keep.txt', 'kept\n');
    for (const event of EVENTS) {
      for (const hook of ruleHooks(client, event)) {
        const result = runClientHook(client, hook, repo, { cwd: join(repo.dir, 'sub') });
        assert.equal(result.status, 0, `${event}: ${result.stderr}`);
        assert.equal(result.stderr, '', `${event} wrote to stderr`);
      }
    }
  });
}
