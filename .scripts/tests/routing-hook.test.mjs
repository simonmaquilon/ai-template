import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { hookFor, makeRepo, runClientHook } from './support.mjs';

const ROUTING = [
  '# AGENTS.md',
  '',
  '## Instruction routing',
  '',
  '- `05-layout.md`: when moving code or removing directories.',
  '- `06-commands.md`: before running or recommending commands.',
  '',
].join('\n');

for (const client of ['claude', 'codex']) {
  const hook = () => hookFor(client, 'UserPromptSubmit', 'remind-routing.mjs');

  test(`${client}: the routing hook lists only the path of each module on every turn`, (t) => {
    const repo = makeRepo(t);
    repo.write('AGENTS.md', ROUTING);
    repo.write('sub/keep.txt', 'kept\n');
    const turn = () => runClientHook(client, hook(), repo, { cwd: join(repo.dir, 'sub'), input: { session_id: 'one' } });

    const paths = turn();
    assert.equal(paths.status, 0, paths.stderr);
    assert.equal(paths.stderr, '');
    assert.match(paths.stdout, /^Instruction routing \(AGENTS\.md\): /);
    assert.match(paths.stdout, /^\.agents\/instructions\/05-layout\.md$/m);
    assert.match(paths.stdout, /^\.agents\/instructions\/06-commands\.md$/m);
    assert.doesNotMatch(paths.stdout, /when moving code|before running or recommending/);

    // Nothing is recorded between runs: every turn gets the same reminder.
    assert.equal(turn().stdout, paths.stdout);
    assert.equal(existsSync(join(repo.dir, '.temp')), false);
  });

  test(`${client}: the routing hook prints nothing without routing entries`, (t) => {
    const repo = makeRepo(t);
    assert.equal(runClientHook(client, hook(), repo).stdout, '');
    repo.write('AGENTS.md', '# AGENTS.md\n\nNo routing table yet.\n');
    const result = runClientHook(client, hook(), repo);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
  });

  test(`${client}: no hook runs when a session starts`, () => {
    assert.throws(() => hookFor(client, 'SessionStart', 'remind-routing.mjs'));
  });
}
