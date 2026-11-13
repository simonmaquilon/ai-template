import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { URL, commit } from './template-manifest-fixture.mjs';
import { FILES, derived, guard, read, seal } from './template-seal-fixture.mjs';

const MARKERS = ['.github/workflows/template-checks.yml', '.readme/94-template-ci.md'];
const write = (repo, path) => ({ tool_name: 'Write', tool_input: { file_path: join(repo.dir, path), content: 'x' } });
const add = (path) => ({ tool_name: 'apply_patch', tool_input: { command: `*** Begin Patch\n*** Add File: ${path}\n+x\n*** End Patch\n` } });
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

test('writing a template CI file in a derived project asks in Claude Code and is denied in Codex, in the shell too', (t) => {
  const repo = derived(t);
  for (const path of MARKERS) {
    assert.equal(guard(repo, 'claude', write(repo, path))?.[0], 'ask', path);
    assert.equal(guard(repo, 'codex', add(path))?.[0], 'deny', path);
    assert.equal(guard(repo, 'claude', bash(`echo x > ${path}`))?.[0], 'ask', path);
    assert.equal(guard(repo, 'codex', bash(`echo x | tee ${path}`))?.[0], 'deny', path);
  }
});

test('a template CI file a derived project creates by hand, staged or not, leaves the seal on', (t) => {
  const repo = derived(t);
  for (const path of MARKERS) repo.write(path, 'made by hand\n');
  repo.write('AGENTS.md', 'edited\n');
  assert.match(seal(repo), /^- AGENTS\.md: content changed; restored/m);
  assert.equal(guard(repo, 'claude', write(repo, 'AGENTS.md'))?.[0], 'deny');
  repo.git('add', '--', ...MARKERS);
  repo.write('AGENTS.md', 'edited again\n');
  assert.match(seal(repo), /^- AGENTS\.md: content changed; restored/m);
  assert.equal(guard(repo, 'claude', write(repo, 'AGENTS.md'))?.[0], 'deny');
});

test('the template keeps its seal off when its CI files leave the disk, a derived project under its origin does not', (t) => {
  const repo = derived(t);
  for (const path of MARKERS) repo.write(path, 'only validates the template\n');
  commit(repo);
  repo.git('remote', 'set-url', 'origin', URL);
  for (const path of MARKERS) rmSync(join(repo.dir, path));
  repo.write('AGENTS.md', 'maintained\n');
  assert.equal(seal(repo), '');
  assert.equal(guard(repo, 'claude', write(repo, 'AGENTS.md')), null);
  repo.git('rm', '-q', '--cached', '--', ...MARKERS);
  repo.git('commit', '-q', '-m', 'start: drop the template CI');
  assert.match(seal(repo), /^- AGENTS\.md: content changed; restored/m);
  assert.equal(read(repo, 'AGENTS.md'), FILES['AGENTS.md']);
});

test('a prompt with no drift never walks the history for the manifest commit', (t) => {
  const repo = derived(t);
  const trace = join(repo.dir, '.git', 'trace.txt');
  process.env.GIT_TRACE = trace;
  try {
    assert.equal(seal(repo), '');
    assert.doesNotMatch(readFileSync(trace, 'utf8'), /git log\b/);
    rmSync(trace);
    repo.write('AGENTS.md', 'edited\n');
    assert.match(seal(repo), /^- AGENTS\.md: content changed; restored/m);
    assert.ok(existsSync(trace) && /git log\b/.test(readFileSync(trace, 'utf8')), 'a drift needs the manifest commit');
  } finally {
    delete process.env.GIT_TRACE;
  }
});
