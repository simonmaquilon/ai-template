import assert from 'node:assert/strict';
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS } from './support.mjs';
import { commit, template } from './template-manifest-fixture.mjs';
import { EXCEPTIONS, MARKER, derived, guard } from './template-seal-fixture.mjs';

// Only the template-only paths the sealed .claude/settings.json names in a sandbox exclusion or an allow rule are
// reserved in a derived project: today the runner of the checks. The two template CI files that mark a template
// checkout stay under the seal's own control, which asks in Claude Code, and are not judged here.
const FILE = '.scripts/run-checks.mjs';
const SETTINGS = '.claude/settings.json';
const MESSAGE = (path) => `01-meta-guidelines.md: ${JSON.stringify(path)} is a template-only path (TEMPLATE_ONLY in .scripts/template-files.mjs) `
  + 'that the sealed .claude/settings.json exempts from the sandbox or pre-approves, so a file tool may not create or write it in a '
  + 'derived project: a file there would run unconfined and unconfirmed; keep the project\'s own scripts elsewhere.';
const tool = (name, input) => ({ tool_name: name, tool_input: input });
const write = (repo, path) => tool('Write', { file_path: join(repo.dir, path), content: 'x' });
const edit = (repo, path) => tool('Edit', { file_path: join(repo.dir, path), old_string: 'a', new_string: 'b' });
const patch = (...lines) => tool('apply_patch', { command: `*** Begin Patch\n${lines.join('\n')}\n*** End Patch\n` });

test('in a derived project, file tools may not create or write what the settings exempt, and the reason says why', (t) => {
  const repo = derived(t);
  assert.deepEqual(guard(repo, 'claude', write(repo, FILE)), ['deny', MESSAGE(FILE)]);
  assert.deepEqual(guard(repo, 'claude', edit(repo, FILE)), ['deny', MESSAGE(FILE)]);
  for (const header of [`*** Add File: ${FILE}\n+x`, `*** Update File: ${FILE}\n@@\n-a\n+b`, `*** Update File: README.md\n*** Move to: ${FILE}\n@@\n-a\n+b`]) {
    assert.deepEqual(guard(repo, 'codex', patch(header)), ['deny', MESSAGE(FILE)], header);
  }
  const notebook = tool('NotebookEdit', { notebook_path: join(repo.dir, FILE), new_source: 'x' });
  assert.deepEqual(guard(repo, 'claude', notebook), ['deny', MESSAGE(FILE)]);
});

test('a template-only path the settings do not name stays open to the project, its own tests folder included', (t) => {
  const repo = derived(t);
  for (const path of ['.scripts/tests/mio.test.mjs', '.scripts/tests/sub/deep.mjs', '.scripts/check-security-skill.mjs', '.scripts/security-skill-hash.mjs']) {
    assert.equal(guard(repo, 'claude', write(repo, path)), null, path);
    assert.equal(guard(repo, 'codex', patch(`*** Add File: ${path}\n+x`)), null, path);
  }
});

test('what is reserved is read from the settings on every call: exclusions and allow rules count, other lists and a bad file do not', (t) => {
  const repo = derived(t);
  const mine = '.scripts/tests/mio.test.mjs';
  const settings = (value) => repo.write(SETTINGS, typeof value === 'string' ? value : JSON.stringify(value));
  settings({ sandbox: { excludedCommands: ['node .scripts/tests/*'] } });
  assert.deepEqual(guard(repo, 'claude', write(repo, mine)), ['deny', MESSAGE(mine)], 'a sandbox exclusion');
  assert.equal(guard(repo, 'claude', write(repo, FILE)), null, 'no longer named');
  settings({ permissions: { allow: ['Bash(node .scripts/tests/mio.test.mjs)'] } });
  assert.deepEqual(guard(repo, 'claude', write(repo, mine)), ['deny', MESSAGE(mine)], 'an allow rule');
  settings({ permissions: { deny: [`Bash(node ${FILE})`], ask: [`Bash(node ${FILE})`] } });
  assert.equal(guard(repo, 'claude', write(repo, FILE)), null, 'a deny or ask rule exempts nothing');
  settings('{ not json');
  assert.equal(guard(repo, 'claude', write(repo, FILE)), null, 'settings that are not JSON');
  repo.git('rm', '-q', '-f', '--', SETTINGS);
  assert.equal(guard(repo, 'claude', write(repo, FILE)), null, 'no settings file');
});

test('a reserved path is judged by where it really leads, and only a write of it is denied', (t) => {
  const repo = derived(t);
  assert.equal(guard(repo, 'claude', write(repo, `docs/../${FILE}`))?.[0], 'deny', 'through ..');
  assert.equal(guard(repo, 'claude', write(repo, FILE.toUpperCase()))?.[0], 'deny', 'another letter case');
  if (!WINDOWS) {
    symlinkSync(join(repo.dir, '.scripts'), join(repo.dir, 'scripts-link'));
    assert.equal(guard(repo, 'claude', write(repo, `scripts-link/${FILE.split('/').pop()}`))?.[0], 'deny', 'through a link');
  }
  assert.equal(guard(repo, 'codex', patch(`*** Delete File: ${FILE}`)), null, 'deleting writes nothing');
  for (const path of ['.scripts/own-task.mjs', '.scripts/tests-own/a.mjs', '.scripts/run-checks-mine.mjs', '.scripts/run-check.mjs', '.github/workflows/other.yml', 'docs/run-checks.mjs']) {
    assert.equal(guard(repo, 'claude', write(repo, path)), null, path);
    assert.equal(guard(repo, 'codex', patch(`*** Add File: ${path}\n+x`)), null, path);
  }
});

test('the exclusion of the runner, with a space before its *, reserves its path', (t) => {
  const repo = derived(t);
  repo.write(SETTINGS, JSON.stringify({ sandbox: { excludedCommands: [`node ${FILE} *`] } }));
  assert.deepEqual(guard(repo, 'claude', write(repo, FILE)), ['deny', MESSAGE(FILE)]);
  assert.deepEqual(guard(repo, 'codex', patch(`*** Add File: ${FILE}\n+x`)), ['deny', MESSAGE(FILE)]);
  assert.equal(guard(repo, 'claude', write(repo, '.scripts/run-checks-mine.mjs')), null);
});

test('a path whose text starts with a reserved path is reserved too, whatever the form of the exclusion', (t) => {
  const repo = derived(t);
  for (const path of [`${FILE}X`, `${FILE}.bak`, `${FILE}/inner.mjs`, `${FILE}X`.toUpperCase()]) {
    assert.equal(guard(repo, 'claude', write(repo, path))?.[0], 'deny', path);
    assert.equal(guard(repo, 'codex', patch(`*** Add File: ${path}\n+x`))?.[0], 'deny', path);
  }
});

test('the reservation follows the seal: a template, an adoption, and a project without a committed manifest are left alone', (t) => {
  const sealed = derived(t);
  assert.equal(guard(sealed, 'claude', write(sealed, FILE))?.[0], 'deny');
  sealed.write(EXCEPTIONS, '{ not json');
  assert.equal(guard(sealed, 'claude', write(sealed, FILE))?.[0], 'deny', 'a seal paused by its exceptions list still guards');
  sealed.write(MARKER, '2026-11-12T10:00:00Z\n');
  assert.equal(guard(sealed, 'claude', write(sealed, FILE)), null, 'during an adoption');
  assert.equal(guard(sealed, 'codex', patch(`*** Add File: ${FILE}\n+x`)), null, 'during an adoption, in Codex');

  const bare = derived(t);
  bare.git('rm', '-q', '--', '.agents/template-manifest.json');
  commit(bare);
  assert.equal(guard(bare, 'claude', write(bare, FILE)), null, 'no committed manifest');

  const copy = derived(t);
  copy.write('.readme/94-template-ci.md', 'only validates the template\n');
  commit(copy);
  assert.equal(guard(copy, 'claude', write(copy, FILE)), null, 'a copy of the template');
  assert.equal(guard(copy, 'codex', patch(`*** Update File: ${FILE}\n@@\n-a\n+b`)), null, 'a copy of the template, in Codex');

  const maintained = template(t);
  assert.equal(guard(maintained, 'claude', write(maintained, FILE)), null, 'the maintained template');
});
