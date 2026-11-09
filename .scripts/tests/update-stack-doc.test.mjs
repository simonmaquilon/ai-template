import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { markdownWarnings } from '../markdown/rules.mjs';
import { hookFor, makeRepo, run, runClientHook } from './support.mjs';
import { postToolContext } from './hook-context.mjs';
import { IDS, SHA, block, fixture } from './stack-fixture.mjs';

const check = (repo) => run(process.execPath, [join(repo.dir, '.scripts', 'update-stack-doc.mjs'), '--check'], { cwd: repo.dir });

test('update-stack-doc regenerates only the marked blocks from their sources', (t) => {
  const repo = fixture(t);
  const result = repo.sync();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^\.docs\/stack\.md synced \(06-dependencies-and-stack\.md\): runtime, package-manager, dependencies, skills, mcp-servers, plugins, workflows\./);
  const stack = repo.stack();
  assert.equal(stack.split('Also by hand.').length, IDS.length);
  assert.match(stack, /^# Technology Stack\n\nWritten by hand\.\n/);
  for (const row of ['| .nvmrc | node 24 |', '| package.json engines.node | >=22 |', '| pnpm | 9.1.0 | package.json packageManager |',
    '| vue | ^3.5.0 | 3.5.13 | production | MIT |', '| vitest | ^3.0.0 | not installed | development | unknown |',
    '| nuxt | antfu/skills | skills-lock.json |', '| own | this repository | none |', '| docs | yes | yes | `https://example.invalid/mcp` |',
    '| local | no | yes | `server` |', '| typescript-lsp | official | yes |',
    '| ci.yml | ubuntu-24.04, windows-2025 | 24 | actions/checkout v7.0.1, actions/setup-node v4 |']) {
    assert.ok(stack.includes(row), row);
  }
  assert.doesNotMatch(stack, new RegExp(`${SHA}|SECRET|stale|\\$\\{\\{`));
});

test('update-stack-doc keeps the Notes of surviving rows and stays silent when nothing changes', (t) => {
  const repo = fixture(t);
  repo.sync();
  repo.write('.docs/stack.md', repo.stack().replace('| vue | ^3.5.0 | 3.5.13 | production | MIT | |', '| vue | ^3.5.0 | 3.5.13 | production | MIT | UI core \\| kept |'));
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

test('update-stack-doc reports as an agent hook only when it changed something', (t) => {
  const repo = fixture(t);
  const post = repo.sync({ hook_event_name: 'PostToolUse', tool_input: { command: 'npm install' } });
  assert.match(postToolContext(post), /\.docs\/stack\.md synced/);
  assert.equal(postToolContext(repo.sync({ hook_event_name: 'PostToolUse' })), '');
  repo.write('.nvmrc', '22\n');
  const turn = repo.sync({ hook_event_name: 'UserPromptSubmit' });
  assert.match(turn.stdout, /^\.docs\/stack\.md synced \(06-dependencies-and-stack\.md\): runtime\./);
  repo.write('skills-lock.json', '{ not json');
  const broken = repo.sync({ hook_event_name: 'PostToolUse' });
  assert.match(postToolContext(broken), /^\.docs\/stack\.md blocks not synced \(06-dependencies-and-stack\.md\): skills;/);
  assert.doesNotMatch(postToolContext(broken), /not json|Unexpected/);
});

test('update-stack-doc renders a URL endpoint and a command in code so that neither is a bare URL', (t) => {
  const repo = fixture(t);
  repo.sync();
  const endpoints = repo.stack().split('\n').filter((line) => line.startsWith('| docs |') || line.startsWith('| local |'));
  assert.deepEqual(endpoints, ['| docs | yes | yes | `https://example.invalid/mcp` | |', '| local | no | yes | `server` | |']);
});

test('update-stack-doc shows the command of a server literally, in code, when its name holds Markdown or HTML', (t) => {
  const repo = fixture(t);
  const commands = { a: 'my_*server*_bin --token SECRET', b: '<b>x</b>' };
  repo.write('.mcp.json', JSON.stringify({ mcpServers: Object.fromEntries(Object.entries(commands).map(([name, command]) => [name, { command }])) }));
  repo.sync();
  const rows = repo.stack().split('\n').filter((line) => /^\| [ab] \|/.test(line));
  assert.deepEqual(rows, ['| a | yes | no | `my_*server*_bin` | |', '| b | yes | no | `<b>x</b>` | |']);
});

test('update-stack-doc fences a URL endpoint with a longer backtick run than it holds, padded when it ends in one', (t) => {
  const repo = fixture(t);
  const urls = { a: 'https://exa`mple.invalid/mcp', b: 'https://a`www.example.com/mcp', c: 'custom://host`', d: 'https://exa``mple.invalid/mcp', e: 'https://example.invalid/a|b' };
  repo.write('.mcp.json', JSON.stringify({ mcpServers: Object.fromEntries(Object.entries(urls).map(([name, url]) => [name, { url }])) }));
  repo.sync();
  const rows = repo.stack().split('\n').filter((line) => /^\| [a-e] \|/.test(line));
  assert.deepEqual(rows, ['| a | yes | no | ``https://exa`mple.invalid/mcp`` | |', '| b | yes | no | ``https://a`www.example.com/mcp`` | |',
    '| c | yes | no | `` custom://host` `` | |', '| d | yes | no | ```https://exa``mple.invalid/mcp``` | |', '| e | yes | no | `https://example.invalid/a\\|b` | |']);
  assert.deepEqual(markdownWarnings(repo.stack()).filter((warning) => warning.id === 'MD034'), []);
});

test('update-stack-doc --check passes and writes nothing when every block is current', (t) => {
  const repo = fixture(t);
  repo.sync();
  const stack = repo.stack();
  const result = check(repo);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(repo.stack(), stack);
});

test('update-stack-doc --check names the blocks that are out of date, tells how to regenerate them, and writes nothing', (t) => {
  const repo = fixture(t);
  const stale = repo.stack();
  const all = check(repo);
  assert.equal(all.status, 1);
  assert.match(all.stdout, new RegExp(`^\\.docs/stack\\.md blocks out of date \\(06-dependencies-and-stack\\.md\\): ${IDS.join(', ')}\\.`));
  assert.equal(repo.stack(), stale);
  repo.sync();
  repo.write('.nvmrc', '22\n');
  const current = repo.stack();
  const one = check(repo);
  assert.equal(one.status, 1);
  assert.equal(one.stdout, '.docs/stack.md blocks out of date (06-dependencies-and-stack.md): runtime. Run node .scripts/update-stack-doc.mjs to regenerate them.\n');
  assert.equal(repo.stack(), current);
  repo.sync();
  assert.equal(check(repo).status, 0);
});

test('update-stack-doc --check reports a block it cannot sync apart from the stale ones and writes nothing', (t) => {
  const repo = fixture(t);
  repo.write('.docs/stack.md', `# Stack\n\n<!-- stack:generated runtime -->\nhand\n`);
  const broken = repo.stack();
  const alone = check(repo);
  assert.equal(alone.status, 1);
  assert.equal(alone.stdout, '.docs/stack.md blocks not synced (06-dependencies-and-stack.md): runtime; check their markers and sources.\n');
  assert.equal(repo.stack(), broken);
  repo.write('.docs/stack.md', `# Stack\n\n${block('plugins')}\n\n${block('skills')}\n`);
  repo.write('skills-lock.json', '{ not json');
  const both = check(repo);
  assert.equal(both.status, 1);
  assert.match(both.stdout, /^\.docs\/stack\.md blocks out of date .*: plugins\. Run node \.scripts\/update-stack-doc\.mjs .*\n\.docs\/stack\.md blocks not synced .*: skills;/);
  assert.equal(repo.stack(), `# Stack\n\n${block('plugins')}\n\n${block('skills')}\n`);
});

for (const client of ['claude', 'codex']) {
  test(`${client}: the stack hooks sync .docs/stack.md after tools and at turn start`, (t) => {
    const repo = makeRepo(t);
    repo.write('.docs/stack.md', `# Technology Stack\n\n${block('skills')}\n`);
    repo.write('skills-lock.json', JSON.stringify({ skills: { nuxt: { source: 'antfu/skills' } } }));
    const input = { cwd: repo.dir, hook_event_name: 'PostToolUse', tool_input: { command: 'npx skills add antfu/skills' } };
    const post = runClientHook(client, hookFor(client, 'PostToolUse', 'update-stack-doc.mjs'), repo, { input });
    assert.match(postToolContext(post), /\.docs\/stack\.md synced .*: skills\./);
    assert.match(readFileSync(join(repo.dir, '.docs', 'stack.md'), 'utf8'), /\| nuxt \| antfu\/skills \| skills-lock\.json \| \|/);
    repo.write('skills-lock.json', '{"skills":{}}');
    const turn = runClientHook(client, hookFor(client, 'UserPromptSubmit', 'update-stack-doc.mjs'), repo,
      { input: { cwd: repo.dir, hook_event_name: 'UserPromptSubmit' } });
    assert.equal(turn.status, 0, turn.stderr);
    assert.match(turn.stdout, /\.docs\/stack\.md synced .*: skills\./);
  });
}
