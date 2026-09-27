import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, hookFor, makeRepo, runClientHook } from './support.mjs';

const BLOCKED = ['git add -A', 'git add .', 'git add -u', 'git add --all', 'git commit -a -m wip', 'git commit -am wip', 'cd docs && git add .'];
const ALLOWED = ['git add README.md', 'git add -- .scripts/check-staging.mjs', 'git commit -m "explicit"', 'git status'];

for (const client of ['claude', 'codex']) {
  test(`${client}: the staging guard rejects bulk staging and allows explicit paths`, (t) => {
    const repo = makeRepo(t);
    const hook = hookFor(client, 'PreToolUse', 'check-staging.mjs');
    for (const command of BLOCKED) {
      const result = runClientHook(client, hook, repo, { input: { tool_input: { command } } });
      assert.equal(result.status, 2, `${command}: ${result.stderr}`);
      assert.match(result.stderr, /27-version-control\.md/);
    }
    for (const command of ALLOWED) {
      const result = runClientHook(client, hook, repo, { input: { tool_input: { command } } });
      assert.equal(result.status, 0, `${command}: ${result.stderr}`);
    }
  });

  test(`${client}: the staging guard reads an argument list and runs from a subdirectory`, (t) => {
    const repo = makeRepo(t);
    mkdirSync(join(repo.dir, 'docs'));
    const hook = hookFor(client, 'PreToolUse', 'check-staging.mjs');
    const input = { tool_input: { command: ['git', 'add', '-A'] } };
    assert.equal(runClientHook(client, hook, repo, { cwd: join(repo.dir, 'docs'), input }).status, 2);
    assert.equal(runClientHook(client, hook, repo, { input: {} }).status, 0);
  });
}

test('claude: the staging guard matches both of its shell tools', () => {
  const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'));
  const group = settings.hooks.PreToolUse.find((candidate) => JSON.stringify(candidate).includes('check-staging.mjs'));
  assert.deepEqual(group.matcher.split('|').sort(), ['Bash', 'PowerShell']);
});
