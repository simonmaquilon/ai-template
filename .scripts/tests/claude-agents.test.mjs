import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT } from './support.mjs';

// A delegated task must not delegate again (14-delegation.md); the client enforces it only when the agent
// definition removes the tool that launches subagents.
const DIR = join(ROOT, '.claude', 'agents');
const agents = readdirSync(DIR).filter((name) => name.endsWith('.md'));

function frontmatter(name) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(join(DIR, name), 'utf8'));
  assert.ok(match, `${name} opens with a frontmatter block`);
  return Object.fromEntries(match[1].split(/\r?\n/).map((line) => {
    const at = line.indexOf(':');
    return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
  }));
}

test('the repository declares one Claude Code agent per capability tier', () => {
  assert.deepEqual(agents, ['copilot-haiku.md', 'copilot-opus.md', 'copilot-sonnet.md']);
});

for (const name of agents) {
  test(`${name} cannot launch subagents`, () => {
    const tools = frontmatter(name).disallowedTools?.split(',').map((tool) => tool.trim());
    assert.ok(tools?.includes('Agent'), `${name} declares disallowedTools: Agent`);
  });
}
