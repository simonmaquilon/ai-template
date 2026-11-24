// A derived project grows and adapts: its own instruction module, registered in the exceptions list, and its own
// settings in .claude/settings.local.json, neither of which the seal restores or the checks report.

import assert from 'node:assert/strict';
import test from 'node:test';
import { derivedProject, events, fire, hookEnv, read, registered, start, status, toolCall } from './derived-project-fixture.mjs';

const EXCEPTIONS = '.agents/template-exceptions.json';
const LOCAL = '.claude/settings.local.json';
const commit = (repo, message, ...paths) => {
  assert.equal(repo.git('add', '--', ...paths).status, 0);
  assert.equal(repo.git('commit', '-q', '-m', message).status, 0);
};
const runHook = (repo, client, env, script) =>
  start(client, registered(repo, client, 'UserPromptSubmit').find((entry) => entry.script === script), repo, env, events.prompt);

test('a project with its own CI workflow gets no documentation warning about the template workflow the docs cite', (t) => {
  const repo = derivedProject(t);
  repo.write('.github/workflows/ci.yml', 'name: ci\n');
  commit(repo, 'ci', '.github/workflows/ci.yml');
  const result = repo.script('check-doc-links.mjs');
  assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', '']);
});

for (const client of ['claude', 'codex']) {
  test(`${client}: an own instruction module and the exceptions list keep the checks silent and AGENTS.md unrestored`, async (t) => {
    const repo = derivedProject(t);
    const env = hookEnv(t, repo, client);
    const agents = read(repo, 'AGENTS.md');
    const last = /^- `16-command-execution\.md`:.*$/m.exec(agents)[0];
    repo.write('AGENTS.md', agents.replace(last, `${last}\n- \`50-example.md\`: before changing the example area.`));
    repo.write('.agents/instructions/50-example.md', '# Example\n\nRead before changing the example area.\n\n- Keep the example area small.\n');
    repo.write(EXCEPTIONS, `${JSON.stringify({ 'AGENTS.md': 'The project routes its own module, see [the plan](.docs/plan.md).' }, null, 2)}\n`);
    commit(repo, 'own module', 'AGENTS.md', '.agents/instructions/50-example.md', EXCEPTIONS);
    for (const script of ['check-instructions.mjs', 'check-doc-links.mjs', 'check-template-seal.mjs']) {
      const { status: code, stdout, stderr } = await runHook(repo, client, env, script);
      assert.deepEqual([code, stdout, stderr], [0, '', ''], script);
    }
    assert.equal(read(repo, 'AGENTS.md'), agents.replace(last, `${last}\n- \`50-example.md\`: before changing the example area.`));
  });

  test(`${client}: settings.local.json is left alone by the seal, and its denyWrite path is protected`, async (t) => {
    const repo = derivedProject(t);
    const env = hookEnv(t, repo, client);
    repo.write('vault/a.txt', 'a\n');
    commit(repo, 'vault', 'vault/a.txt');
    const local = `${JSON.stringify({ permissions: { allow: ['Bash(make test)'] }, sandbox: { filesystem: { denyWrite: ['vault/'] } } }, null, 2)}\n`;
    repo.write(LOCAL, local);
    const sealed = await runHook(repo, client, env, 'check-template-seal.mjs');
    assert.deepEqual([sealed.status, sealed.stdout, sealed.stderr], [0, '', '']);
    assert.equal(read(repo, LOCAL), local);
    assert.deepEqual(status(repo), []);
    const results = await fire(repo, client, env, 'PreToolUse', toolCall(repo, client, 'shell', 'rm vault/a.txt'));
    const guard = results.find(({ script }) => script === 'check-protected-paths.mjs');
    assert.equal(guard.verdict, client === 'claude' ? 'ask' : 'reject', `${guard.stdout}${guard.stderr}`);
    const other = await fire(repo, client, env, 'PreToolUse', toolCall(repo, client, 'shell', 'rm other/a.txt'));
    assert.equal(other.find(({ script }) => script === 'check-protected-paths.mjs').verdict, 'silent');
  });
}
