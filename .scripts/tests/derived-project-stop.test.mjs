// The end of a turn and the life of a subagent in a project derived from the template, clean and after a prompt: every
// hook registered for Stop, SubagentStart, and SubagentStop exits with 0 and prints nothing.

import assert from 'node:assert/strict';
import test from 'node:test';
import { derivedProject, events, hookEnv, registered, start } from './derived-project-fixture.mjs';

const ENDINGS = [['Stop', events.stop], ['SubagentStart', events.agentStart], ['SubagentStop', events.agentStop]];

async function assertQuiet(repo, client, env, label) {
  for (const [event, input] of ENDINGS) {
    const hooks = registered(repo, client, event);
    assert.ok(hooks.length > 0, `${client} registers ${event} hooks`);
    for (const hook of hooks) {
      const { status, stdout, stderr } = await start(client, hook, repo, env, input);
      assert.deepEqual([status, stdout, stderr], [0, '', ''], `${label}: ${event} ${hook.script}`);
    }
  }
}

for (const client of ['claude', 'codex']) {
  test(`${client}: Stop, SubagentStart, and SubagentStop are silent in a clean derived project and after a prompt`, async (t) => {
    const repo = derivedProject(t);
    const env = hookEnv(t, repo, client);
    await assertQuiet(repo, client, env, 'clean');
    for (const hook of registered(repo, client, 'UserPromptSubmit')) await start(client, hook, repo, env, events.prompt);
    await assertQuiet(repo, client, env, 'after a prompt');
  });
}
