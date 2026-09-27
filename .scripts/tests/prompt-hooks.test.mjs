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
    repo.write('.readme/guides/12-nested.md', 'Nested.\n');
    repo.write('.agents/instructions/02-rule.md', 'Follow `10-guide.md`, `12-nested.md`, `03-retired.md`, and `104-retired.md`.\n');
    repo.write('.readme/20-log.md', 'See `2026-09-27-acta.md`, `001-usar-redis.md`, and `0001-usar-postgres.md`.\n');
    const result = runClientHook(client, hookFor(client, 'UserPromptSubmit', 'check-doc-links.mjs'), repo);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\.agents\/instructions\/02-rule\.md -> 03-retired\.md/);
    assert.match(result.stdout, /02-rule\.md -> 104-retired\.md/);
    assert.doesNotMatch(result.stdout, /10-guide\.md|12-nested\.md|acta|redis|postgres/);
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

  test(`${client}: the instruction hook reports shared prefixes and wrapped rules`, (t) => {
    const repo = makeRepo(t);
    repo.write('AGENTS.md', '- `05-a.md`: a.\n- `05-b.md`: b.\n- `06-c.md`: c.\n');
    repo.write('.agents/instructions/05-a.md', '# A\n\nRead when a.\n\n- A rule that is\n  wrapped onto a second line.\n');
    repo.write('.agents/instructions/05-b.md', '# B\n\nRead when b.\n\n- One rule.\n');
    repo.write('.agents/instructions/06-c.md', '# C\r\n\r\nRead when c.\r\n\r\n- One rule.\r\n- Another rule.\r\n');
    repo.write('.readme/90-x.md', '# X\n');
    repo.write('.readme/90-y.md', '# Y\n');
    repo.write('.readme/91-z.md', '# Z\n');
    const result = runClientHook(client, hookFor(client, 'UserPromptSubmit', 'check-instructions.mjs'), repo);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /wrapped across lines \(01-meta-guidelines\.md\): 05-a\.md:6\n/);
    assert.match(result.stdout, /sharing a numeric prefix \(01-meta-guidelines\.md\): 05-a\.md and 05-b\.md/);
    assert.match(result.stdout, /\.readme\/ documents sharing a numeric prefix \(16-documentation\.md\): 90-x\.md and 90-y\.md/);
    assert.doesNotMatch(result.stdout, /06-c\.md|91-z\.md/);
  });

  test(`${client}: the instruction hook compares prefixes by value and reports retired prefixes reused`, (t) => {
    const repo = makeRepo(t);
    const rule = (name) => repo.write(`.agents/instructions/${name}`, `# ${name}\n\nRead when needed.\n\n- One rule.\n`);
    repo.write('AGENTS.md', ['07-a', '7-b', '08-new', '09-kept', '11-moved', '10-new'].map((name) => `- \`${name}.md\`: x.\n`).join(''));
    for (const name of ['07-a.md', '08-old.md', '09-first.md', '10-moved.md']) rule(name);
    repo.git('add', '--', '.gitignore', 'AGENTS.md', '.agents');
    repo.git('commit', '-q', '-m', 'base');
    repo.git('rm', '-q', '--', '.agents/instructions/08-old.md');
    repo.git('mv', '.agents/instructions/09-first.md', '.agents/instructions/09-kept.md');
    repo.git('mv', '.agents/instructions/10-moved.md', '.agents/instructions/11-moved.md');
    repo.git('commit', '-q', '-m', 'retire');
    for (const name of ['7-b.md', '08-new.md', '10-new.md']) rule(name);
    const result = runClientHook(client, hookFor(client, 'UserPromptSubmit', 'check-instructions.mjs'), repo);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /sharing a numeric prefix \(01-meta-guidelines\.md\): 07-a\.md and 7-b\.md/);
    assert.match(result.stdout, /retired one \(01-meta-guidelines\.md\): 08-new\.md \(retired 08-old\.md\), 10-new\.md \(retired 10-moved\.md\)/);
    assert.doesNotMatch(result.stdout, /09-kept/);
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
