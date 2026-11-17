import assert from 'node:assert/strict';
import test from 'node:test';
import { commit } from './template-manifest-fixture.mjs';
import { MARKER, derived, seal } from './template-seal-fixture.mjs';

// A derived project that already had a file under a path the sealed .claude/settings.json exempts from the sandbox or
// pre-approves would run it unconfined once the release is adopted: the seal hook says so at every prompt.
const FILE = '.scripts/run-checks.mjs';
const NOTICE = (paths) => new RegExp(`^Template seal \\(01-meta-guidelines\\.md\\): the project holds ${paths.map((path) => path.replaceAll('.', '\\.')).join(', ')}; `
  + 'the sealed \\.claude/settings\\.json exempts such a path from the sandbox or pre-approves it, so a program there would run unconfined and '
  + `without confirmation\\. Tell the user, in their language, to rename ${paths.length > 1 ? 'them' : 'it'}; this hook neither deletes nor moves anything\\.$`, 'm');

test('a reserved path that exists is named at every prompt, and nothing is deleted or moved', (t) => {
  const repo = derived(t);
  assert.equal(seal(repo), '', 'without such a path the seal says nothing new');
  repo.write(FILE, 'console.log(1);\n');
  for (const client of ['claude', 'codex', 'claude']) assert.match(seal(repo, client), NOTICE([FILE]), client);
  assert.equal(repo.git('status', '--porcelain', '--', FILE).stdout.trim(), `?? ${FILE}`);
});

test('a path that only starts with a reserved one is named too, and one that does not is not', (t) => {
  const repo = derived(t);
  repo.write('.scripts/run-checks-mine.mjs', 'x\n');
  repo.write('.scripts/tests/mine.test.mjs', 'x\n');
  assert.equal(seal(repo), '');
  repo.write(`${FILE}.bak`, 'x\n');
  repo.write(`${FILE}X`, 'x\n');
  assert.match(seal(repo), NOTICE([`${FILE}.bak`, `${FILE}X`]));
});

test('the notice is silent in a copy of the template, during an adoption, and without a committed manifest', (t) => {
  const copy = derived(t);
  copy.write(FILE, 'x\n');
  copy.write('.readme/94-template-ci.md', 'only validates the template\n');
  commit(copy);
  assert.equal(seal(copy), '', 'a copy of the template');

  const adopting = derived(t);
  adopting.write(FILE, 'x\n');
  adopting.write(MARKER, '2026-11-12T10:00:00Z\n');
  const out = seal(adopting);
  assert.match(out, /a template adoption is in progress/);
  assert.doesNotMatch(out, /the project holds/);

  const bare = derived(t);
  bare.git('rm', '-q', '--', '.agents/template-manifest.json');
  commit(bare);
  bare.write(FILE, 'x\n');
  assert.equal(seal(bare), '', 'no committed manifest');
});
