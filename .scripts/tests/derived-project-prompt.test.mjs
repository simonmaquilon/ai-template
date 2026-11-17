// A prompt in a project derived from the template: every hook registered for UserPromptSubmit exits cleanly, only the
// reminder and, once, the stack sync say anything, and none touches a sealed file or removes the state it keeps.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { derivedProject, events, hookEnv, registered, start, status } from './derived-project-fixture.mjs';

const STATE = ['.temp/check-file-length', '.temp/check-plan-stop'];
const REMINDER = /^Instruction routing \(AGENTS\.md\)[^\n]*\n(\.agents\/instructions\/\d+-[\w-]+\.md\n?)+$/;
const SYNC = /^\.docs\/stack\.md synced \([^)]*\): [^\n.]+\. Review the change[^\n]*\n$/;

// One pass over the registered hooks, one after another or all at once; each result is { script, status, stdout, stderr }.
async function pass(repo, client, env, parallel) {
  const hooks = registered(repo, client, 'UserPromptSubmit');
  assert.ok(hooks.length >= 10, `${client} registers its prompt hooks`);
  const launch = (hook) => start(client, hook, repo, env, events.prompt).then((result) => ({ script: hook.script, ...result }));
  if (parallel) return Promise.all(hooks.map(launch));
  const results = [];
  for (const hook of hooks) results.push(await launch(hook));
  return results;
}

// What a pass printed: nothing from a hook that is not the reminder, except the stack sync once when `sync` allows it.
function assertQuiet(results, label, sync) {
  for (const { script, status: code, stdout, stderr } of results) {
    const where = `${label} ${script}`;
    assert.equal(code, 0, `${where}: ${stderr}${stdout}`);
    assert.equal(stderr, '', where);
    if (script === 'remind-instructions.mjs') assert.match(stdout, REMINDER, where);
    else if (script === 'update-stack-doc.mjs' && sync) assert.match(stdout, SYNC, `${where}: ${stdout}`);
    else assert.equal(stdout, '', where);
  }
  assert.equal(results.filter(({ script }) => script === 'remind-instructions.mjs').length, 1, label);
}

function assertUntouched(repo, label) {
  const changed = status(repo).filter((line) => !/^ ?M \.docs\/stack\.md$/.test(line) && !line.slice(3).startsWith('.temp/'));
  assert.deepEqual(changed, [], `${label}: only .docs/stack.md and the state under .temp/ may differ`);
  for (const folder of STATE) assert.equal(existsSync(join(repo.dir, folder)), true, `${label}: ${folder} was removed or never made`);
}

for (const client of ['claude', 'codex']) {
  test(`${client}: the prompt hooks run one after another, then again, saying only what they should`, async (t) => {
    const repo = derivedProject(t);
    const env = hookEnv(t, repo, client);
    const first = await pass(repo, client, env, false);
    assertQuiet(first, 'first pass', true);
    assertUntouched(repo, 'after the first pass');
    const second = await pass(repo, client, env, false);
    assertQuiet(second, 'second pass', false);
    assertUntouched(repo, 'after the second pass');
  });

  test(`${client}: the prompt hooks started all at once behave the same, and again on the next prompt`, async (t) => {
    const repo = derivedProject(t);
    const env = hookEnv(t, repo, client);
    assertQuiet(await pass(repo, client, env, true), 'parallel first pass', true);
    assertUntouched(repo, 'after the parallel first pass');
    assertQuiet(await pass(repo, client, env, true), 'parallel second pass', false);
    assertUntouched(repo, 'after the parallel second pass');
  });
}
