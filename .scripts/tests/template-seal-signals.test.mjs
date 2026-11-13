import assert from 'node:assert/strict';
import { lstatSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { commit } from './template-manifest-fixture.mjs';
import { EXCEPTIONS, FILES, MARKER, derived, exists, guard, read, seal } from './template-seal-fixture.mjs';

const MANIFEST = '.agents/template-manifest.json';
const CI = ['.github/workflows/template-checks.yml', '.readme/94-template-ci.md'];
const write = (repo, path) => ({ tool_name: 'Write', tool_input: { file_path: join(repo.dir, path), content: 'x' } });
const add = (path) => ({ tool_name: 'apply_patch', tool_input: { command: `*** Begin Patch\n*** Add File: ${path}\n+{}\n*** End Patch\n` } });
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const manifestWith = (repo, change) => {
  const manifest = JSON.parse(read(repo, MANIFEST));
  change(manifest.files);
  repo.write(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  commit(repo);
};

test('a derived project with its own tests and run-checks.mjs stays sealed', (t) => {
  const repo = derived(t);
  repo.write('.scripts/tests/own.test.mjs', 'test\n');
  repo.write('.scripts/run-checks.mjs', 'project checks\n');
  commit(repo);
  repo.write('AGENTS.md', 'edited\n');
  assert.match(seal(repo), /^- AGENTS\.md: content changed; restored/m);
  assert.equal(guard(repo, 'claude', write(repo, 'AGENTS.md'))?.[0], 'deny');
});

test('a new project is sealed as soon as start deletes the template CI files, before any commit', (t) => {
  const repo = derived(t);
  for (const path of CI) repo.write(path, 'only validates the template\n');
  commit(repo);
  repo.write('AGENTS.md', 'edited\n');
  assert.equal(seal(repo), '');
  for (const path of CI) rmSync(join(repo.dir, path));
  assert.match(seal(repo), /^- AGENTS\.md: content changed; restored/m);
});

test('the marker and the exceptions list in another letter case are guarded where the file system ignores case', (t) => {
  const repo = derived(t);
  if (!lstatSync(join(repo.dir, 'agents.md'), { throwIfNoEntry: false })) return t.skip('case-sensitive file system');
  for (const path of ['.temp/Template-Adoption', '.agents/Template-Exceptions.json']) {
    assert.equal(guard(repo, 'claude', write(repo, path))?.[0], 'ask', path);
    assert.equal(guard(repo, 'codex', add(path))?.[0], 'deny', path);
  }
  assert.equal(guard(repo, 'claude', write(repo, 'agents.md'))?.[0], 'deny');
});

test('a sealed file whose deletion was committed is restored when the release or the manifest commit holds it', (t) => {
  for (const release of [true, false]) {
    const repo = derived(t, { release });
    repo.git('rm', '-q', '--', 'AGENTS.md');
    commit(repo);
    assert.match(seal(repo), /^- AGENTS\.md: deleted; restored$/m, `release ${release}`);
    assert.equal(read(repo, 'AGENTS.md'), FILES['AGENTS.md']);
  }
});

test('during an adoption, Codex may write the exceptions list and Claude Code still asks', (t) => {
  const repo = derived(t);
  repo.write(MARKER, 'now\n');
  assert.equal(guard(repo, 'codex', add(EXCEPTIONS)), null);
  assert.equal(guard(repo, 'claude', write(repo, EXCEPTIONS))?.[0], 'ask');
});

test('without the release, an entry the manifest commit does not hold is never restored', (t) => {
  const repo = derived(t);
  repo.write('src/app.js', 'project code\n');
  commit(repo);
  manifestWith(repo, (files) => { files['src/app.js'] = files['AGENTS.md']; });
  assert.match(seal(repo), /^- src\/app\.js: content changed; not restored: the commit that recorded/m);
  assert.equal(read(repo, 'src/app.js'), 'project code\n');
});

test('with the release fetched, its files missing from the manifest are reported', (t) => {
  const repo = derived(t, { release: true });
  manifestWith(repo, (files) => { delete files['.agents/instructions/02-change-workflow.md']; });
  assert.match(seal(repo), /refs\/plantilla\/1\.0\.0 ships files that \.agents\/template-manifest\.json does not list: \.agents\/instructions\/02-change-workflow\.md/);
});

test('a manifest that was never committed, as in a template unpacked without git add, neither restores nor guards', (t) => {
  const repo = derived(t);
  repo.git('rm', '-q', '--cached', '--', MANIFEST);
  repo.git('commit', '-q', '-m', 'manifest left unstaged');
  repo.write('AGENTS.md', 'edited\n');
  assert.equal(seal(repo), '');
  assert.equal(guard(repo, 'claude', write(repo, 'AGENTS.md')), null);
  assert.equal(read(repo, 'AGENTS.md'), 'edited\n');
});

test('shell redirections and tee into the marker or the exceptions list ask in Claude Code and are denied in Codex', (t) => {
  const repo = derived(t);
  for (const command of ['echo {} > .agents/template-exceptions.json', 'date | tee .temp/template-adoption']) {
    assert.equal(guard(repo, 'claude', bash(command))?.[0], 'ask', command);
    assert.equal(guard(repo, 'codex', bash(command))?.[0], 'deny', command);
  }
  for (const command of ['touch .temp/template-adoption', 'echo hi > .temp/notes.txt']) assert.equal(guard(repo, 'claude', bash(command)), null, command);
  assert.equal(exists(repo, MARKER), false);
});
