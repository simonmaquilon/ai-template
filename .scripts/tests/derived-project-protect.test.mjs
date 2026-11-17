// The protections a derived project keeps: the seal on shared settings and instructions, the reserved template-only
// paths, explicit staging, and the protected folders of the sandbox settings, as each client's hooks enforce them.

import assert from 'node:assert/strict';
import test from 'node:test';
import { derivedProject, fire, hookEnv, toolCall } from './derived-project-fixture.mjs';

const SEALED = /is a sealed template file in this derived project/;
const RESERVED = /is a template-only path \(TEMPLATE_ONLY in \.scripts\/template-files\.mjs\)/;

// The result of the named hook before a tool call, which must be the verdict `want`, and its reason when the hook
// printed one as JSON.
async function before(repo, client, env, call, script, want, reason) {
  const results = await fire(repo, client, env, 'PreToolUse', call);
  const found = results.find((result) => result.script === script);
  assert.ok(found, `${client} runs ${script} before ${call.tool_name}`);
  assert.equal(found.verdict, want, `${script}: ${found.stdout}${found.stderr}`);
  if (reason) assert.match(JSON.parse(found.stdout).hookSpecificOutput.permissionDecisionReason, reason);
}

for (const client of ['claude', 'codex']) {
  test(`${client}: the seal denies a file tool its shared settings and AGENTS.md`, async (t) => {
    const repo = derivedProject(t);
    const env = hookEnv(t, repo, client);
    for (const path of ['.claude/settings.json', 'AGENTS.md']) {
      await before(repo, client, env, toolCall(repo, client, 'edit', '# AGENTS.md', path), 'check-write-scope.mjs', 'deny', SEALED);
    }
  });

  test(`${client}: the runner that only validates the template is a reserved path no file tool may create`, async (t) => {
    const repo = derivedProject(t);
    const env = hookEnv(t, repo, client);
    await before(repo, client, env, toolCall(repo, client, 'write', 'process.exit(0);', '.scripts/run-checks.mjs'),
      'check-write-scope.mjs', 'deny', RESERVED);
  });

  test(`${client}: bulk staging is rejected`, async (t) => {
    const repo = derivedProject(t);
    await before(repo, client, hookEnv(t, repo, client), toolCall(repo, client, 'shell', 'git add -A'), 'check-bulk-staging.mjs', 'reject');
  });

  test(`${client}: removing a protected script asks Claude Code and is rejected for Codex`, async (t) => {
    const repo = derivedProject(t);
    await before(repo, client, hookEnv(t, repo, client), toolCall(repo, client, 'shell', 'rm .scripts/hook-support.mjs'),
      'check-protected-paths.mjs', client === 'claude' ? 'ask' : 'reject');
  });
}
