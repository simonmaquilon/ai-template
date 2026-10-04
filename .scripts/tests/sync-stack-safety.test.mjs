import assert from 'node:assert/strict';
import { readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, WINDOWS } from './support.mjs';
import { postToolContext } from './hook-context.mjs';
import { SHA, block, fixture } from './stack-fixture.mjs';

test('sync-stack never copies credentials, queries, fragments, hashes, or command arguments', (t) => {
  const repo = fixture(t);
  repo.write('.mcp.json', JSON.stringify({ mcpServers: { a: { url: 'https://user:SECRET@mcp.example/mcp?k=SECRET#SECRET' }, b: { command: 'API_KEY=SECRET npx' } } }));
  repo.write('skills-lock.json', JSON.stringify({ skills: { s: { source: 'https://tok:SECRET@github.com/o/r.git?x=SECRET' } } }));
  repo.write('package.json', JSON.stringify({ dependencies: { g: `git+https://user:SECRET@github.com/o/r.git#${SHA}`, h: 'github:o/r#abcdef1' } }));
  repo.write('.github/workflows/ci.yml', `steps:\n  - uses: a/b@${'f'.repeat(64)}\n  - uses: c/d@abcdef1234 # pinned SECRET\n`);
  repo.sync();
  const stack = repo.stack();
  for (const row of ['| a | yes | no | https://mcp.example/mcp |', '| b | yes | no | unknown |', '| s | https://github.com/o/r.git | skills-lock.json |',
    '| g | https://github.com/o/r.git |', '| h | github:o/r |', 'a/b (pinned by commit), c/d (pinned by commit)']) {
    assert.ok(stack.includes(row), row);
  }
  assert.doesNotMatch(stack, /SECRET|abcdef1|ffffffff/);
});

test('sync-stack reads nothing outside the repository or through symbolic links', (t) => {
  const repo = fixture(t);
  const outside = fixture(t);
  outside.write('node_modules/x/package.json', JSON.stringify({ version: '6.6.6', license: 'LEAKED' }));
  outside.write('secret.txt', 'TOP-SECRET line\n');
  repo.write('package.json', JSON.stringify({ dependencies: { [`../../${outside.dir.split(/[\\/]/).pop()}/node_modules/x`]: '1.0.0' } }));
  repo.write('.node-version', 'lts/* and more text');
  if (!WINDOWS) {
    rmSync(join(repo.dir, '.nvmrc'));
    symlinkSync(join(outside.dir, 'secret.txt'), join(repo.dir, '.nvmrc'));
  }
  repo.sync();
  assert.doesNotMatch(repo.stack(), /6\.6\.6|LEAKED|TOP-SECRET/);
  assert.ok(repo.stack().includes('| .node-version | unrecognized |'));
});

test('sync-stack keeps notes when a table changes its columns and protects its markers', (t) => {
  const repo = fixture(t);
  repo.sync();
  const old = '<!-- stack:generated skills -->\n| Skill | Source | Notes |\n| --- | --- | --- |\n| nuxt | x | keep | this |\n<!-- /stack:generated skills -->';
  repo.write('STACK.md', repo.stack().replace(/<!-- stack:generated skills -->[\s\S]*?<!-- \/stack:generated skills -->/, old));
  repo.write('package.json', JSON.stringify({ dependencies: { 'z<!-- /stack:generated dependencies -->': '1.0.0' } }));
  repo.sync();
  const stack = repo.stack();
  assert.ok(stack.includes('| nuxt | antfu/skills | skills-lock.json | keep \\| this |'));
  assert.equal(stack.match(/<!-- \/stack:generated dependencies -->/g).length, 1);
  assert.equal(repo.sync().stdout, '');
  repo.write('STACK.md', `# Stack\n\n<!-- stack:generated runtime -->\nhand\n\nKEEP ME\n\n${block('runtime')}\n`);
  const result = repo.sync({ hook_event_name: 'PostToolUse' });
  assert.match(postToolContext(result), /synced .*: runtime\. .*\nSTACK\.md blocks not synced .*: runtime;/);
  assert.ok(repo.stack().includes('hand\n\nKEEP ME'));
});

test('sync-stack keeps other blocks in sync when one source is unreadable', (t) => {
  const repo = fixture(t);
  repo.write('skills-lock.json', '﻿{ broken');
  repo.write('package.json', `﻿${JSON.stringify({ engines: { node: '>=24' } })}`);
  const result = repo.sync({ hook_event_name: 'UserPromptSubmit' });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /synced .*runtime/);
  assert.match(result.stdout, /blocks not synced .*: skills;/);
  assert.ok(repo.stack().includes('| package.json engines.node | >=24 |'));
});

test('sync-stack parses large workflow files in linear time', (t) => {
  const repo = fixture(t);
  repo.write('.github/workflows/big.yml', '  \n'.repeat(20000) + '\n'.repeat(20000));
  const started = Date.now();
  assert.equal(repo.sync().status, 0);
  assert.ok(Date.now() - started < 5000, `${Date.now() - started} ms`);
});

for (const [client, file, tools] of [['claude', '.claude/settings.json', ['Edit', 'Write', 'Bash', 'PowerShell']],
  ['codex', '.codex/hooks.json', ['Edit', 'Write', 'apply_patch', 'Bash']]]) {
  test(`${client}: the stack hook runs after ${tools.join(', ')} and at turn start`, () => {
    const hooks = JSON.parse(readFileSync(join(ROOT, file), 'utf8')).hooks;
    const groups = (event) => hooks[event].filter((group) => JSON.stringify(group).includes('sync-stack.mjs'));
    const [post] = groups('PostToolUse');
    assert.deepEqual(post.matcher.split('|').sort(), [...tools].sort());
    assert.equal(groups('UserPromptSubmit').length, 1);
    for (const hook of [...post.hooks, ...groups('UserPromptSubmit')[0].hooks].filter((h) => JSON.stringify(h).includes('sync-stack'))) {
      if (hook.commandWindows) assert.match(hook.commandWindows, /-- --hook$/);
      assert.match(JSON.stringify(hook), /--hook/);
      assert.equal(hook.statusMessage, 'Syncing STACK.md');
    }
  });
}
