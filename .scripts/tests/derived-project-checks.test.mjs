// The manual checks the adoption guide lists for a derived project, run from its root as that guide says: each exits
// with 0 and prints nothing, and the stack check follows a synchronization.

import assert from 'node:assert/strict';
import test from 'node:test';
import { derivedProject } from './derived-project-fixture.mjs';

const CHECKS = [
  ['check-doc-links', ['check-doc-links.mjs']],
  ['check-instructions', ['check-instructions.mjs']],
  ['check-bugs', ['check-bugs.mjs']],
  ['check-markdown --all', ['check-markdown.mjs', '--all']],
  ['check-symlinks', ['check-symlinks.mjs']],
  ['update-stack-doc --check', ['update-stack-doc.mjs', '--check']],
  ['tool-versions --check', ['tool-versions.mjs', '--check']],
  ['check-file-length --base HEAD', ['check-file-length.mjs', '--base', 'HEAD']],
];

test('the manual checks of the adoption guide pass, silently, in a derived project', async (t) => {
  const repo = derivedProject(t);
  const synced = repo.script('update-stack-doc.mjs');
  assert.equal(synced.status, 0, synced.stderr);
  for (const [name, [script, ...args]] of CHECKS) {
    await t.test(name, () => {
      const result = repo.script(script, args);
      assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', ''], name);
    });
  }
});
