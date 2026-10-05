import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { hookFor, makeRepo, runClientHook } from './support.mjs';
import { postToolContext } from './hook-context.mjs';
import { IDS, SHA, block, fixture } from './stack-fixture.mjs';

test('sync-stack regenerates only the marked blocks from their sources', (t) => {
  const repo = fixture(t);
  const result = repo.sync();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^STACK\.md synced \(33-stack-register\.md\): runtime, package-manager, dependencies, skills, mcp-servers, plugins, workflows\./);
  const stack = repo.stack();
  assert.equal(stack.split('Also by hand.').length, IDS.length);
  assert.match(stack, /^# Technology Stack\n\nWritten by hand\.\n/);
  for (const row of ['| .nvmrc | node 24 |', '| package.json engines.node | >=22 |', '| pnpm | 9.1.0 | package.json packageManager |',
    '| vue | ^3.5.0 | 3.5.13 | production | MIT |', '| vitest | ^3.0.0 | not installed | development | unknown |',
    '| nuxt | antfu/skills | skills-lock.json |', '| own | this repository | none |', '| docs | yes | yes | https://example.invalid/mcp |',
    '| local | no | yes | server |', '| typescript-lsp | official | yes |',
    '| ci.yml | ubuntu-24.04, windows-2025 | 24 | actions/checkout v7.0.1, actions/setup-node v4 |']) {
    assert.ok(stack.includes(row), row);
  }
  assert.doesNotMatch(stack, new RegExp(`${SHA}|SECRET|stale|\\$\\{\\{`));
});

test('sync-stack keeps the Notes of surviving rows and stays silent when nothing changes', (t) => {
  const repo = fixture(t);
  repo.sync();
  repo.write('STACK.md', repo.stack().replace('| vue | ^3.5.0 | 3.5.13 | production | MIT | |', '| vue | ^3.5.0 | 3.5.13 | production | MIT | UI core \\| kept |'));
  repo.write('package.json', JSON.stringify({ dependencies: { vue: '^3.5.0', pinia: '^3.0.0' } }));
  assert.match(repo.sync().stdout, /synced .*: runtime, package-manager, dependencies\./);
  const stack = repo.stack();
  assert.ok(stack.includes('| vue | ^3.5.0 | 3.5.13 | production | MIT | UI core \\| kept |'));
  assert.ok(stack.includes('| pinia | ^3.0.0 | not installed | production | unknown | |'));
  const again = repo.sync();
  assert.equal(again.status, 0, again.stderr);
  assert.equal(again.stdout, '');
  assert.equal(repo.stack(), stack);
});

test('sync-stack reports as an agent hook only when it changed something', (t) => {
  const repo = fixture(t);
  const post = repo.sync({ hook_event_name: 'PostToolUse', tool_input: { command: 'npm install' } });
  assert.match(postToolContext(post), /STACK\.md synced/);
  assert.equal(postToolContext(repo.sync({ hook_event_name: 'PostToolUse' })), '');
  repo.write('.nvmrc', '22\n');
  const turn = repo.sync({ hook_event_name: 'UserPromptSubmit' });
  assert.match(turn.stdout, /^STACK\.md synced \(33-stack-register\.md\): runtime\./);
  repo.write('.nvmrc', '20\n');
  const failed = repo.sync({ hook_event_name: 'PostToolUseFailure', tool_input: { command: 'npm install' } });
  assert.match(postToolContext(failed, 'PostToolUseFailure'), /^STACK\.md synced \(33-stack-register\.md\): runtime\./);
  repo.write('skills-lock.json', '{ not json');
  const broken = repo.sync({ hook_event_name: 'PostToolUse' });
  assert.match(postToolContext(broken), /^STACK\.md blocks not synced \(33-stack-register\.md\): skills;/);
  assert.doesNotMatch(postToolContext(broken), /not json|Unexpected/);
});

for (const client of ['claude', 'codex']) {
  test(`${client}: the stack hooks sync STACK.md after tools and at turn start`, (t) => {
    const repo = makeRepo(t);
    repo.write('STACK.md', `# Technology Stack\n\n${block('skills')}\n`);
    repo.write('skills-lock.json', JSON.stringify({ skills: { nuxt: { source: 'antfu/skills' } } }));
    const input = { cwd: repo.dir, hook_event_name: 'PostToolUse', tool_input: { command: 'npx skills add antfu/skills' } };
    const post = runClientHook(client, hookFor(client, 'PostToolUse', 'sync-stack.mjs'), repo, { input });
    assert.match(postToolContext(post), /STACK\.md synced .*: skills\./);
    assert.match(readFileSync(join(repo.dir, 'STACK.md'), 'utf8'), /\| nuxt \| antfu\/skills \| skills-lock\.json \| \|/);
    repo.write('skills-lock.json', '{"skills":{}}');
    const turn = runClientHook(client, hookFor(client, 'UserPromptSubmit', 'sync-stack.mjs'), repo,
      { input: { cwd: repo.dir, hook_event_name: 'UserPromptSubmit' } });
    assert.equal(turn.status, 0, turn.stderr);
    assert.match(turn.stdout, /STACK\.md synced .*: skills\./);
  });
}
