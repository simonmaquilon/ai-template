import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { URL, commit } from './template-manifest-fixture.mjs';
import { EXCEPTIONS, FILES, MARKER, copies, derived, exists, guard, read, seal } from './template-seal-fixture.mjs';

const MANIFEST = '.agents/template-manifest.json';
const end = (repo) => repo.script('check-template-seal.mjs', ['--adoption-end']);
const write = (repo, path) => ({ tool_name: 'Write', tool_input: { file_path: join(repo.dir, path), content: 'x' } });
const patch = (path) => ({ tool_name: 'apply_patch', tool_input: { command: `*** Begin Patch\n*** Update File: ${path}\n@@\n-a\n+b\n*** End Patch\n` } });

test('the template, also a fork, a clone without origin, or one under another remote name, is never sealed', (t) => {
  const repo = derived(t);
  repo.write('.readme/94-template-ci.md', 'only validates the template\n');
  commit(repo);
  repo.write('AGENTS.md', 'maintained\n');
  for (const setup of [() => {}, () => repo.git('remote', 'set-url', 'origin', URL), () => repo.git('remote', 'remove', 'origin'),
    () => repo.git('remote', 'add', 'upstream', URL)]) {
    setup();
    assert.equal(seal(repo), '');
    assert.equal(read(repo, 'AGENTS.md'), 'maintained\n');
    assert.equal(guard(repo, 'claude', write(repo, 'AGENTS.md')), null);
  }
});

test('a derived project whose origin still points at the template, without its template-only files, stays sealed', (t) => {
  const repo = derived(t);
  repo.git('remote', 'set-url', 'origin', URL);
  repo.write('AGENTS.md', 'edited\n');
  assert.match(seal(repo), /^- AGENTS\.md: content changed; restored/m);
  assert.equal(guard(repo, 'claude', write(repo, 'AGENTS.md'))?.[0], 'deny');
  const refused = repo.script('template-manifest.mjs', ['--write']);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /holds neither \.github\/workflows\/template-checks\.yml nor \.readme\/94-template-ci\.md/);
});

test('during an adoption nothing is restored, every prompt says so, and --adoption-end refuses until committed and clean', (t) => {
  const repo = derived(t);
  repo.write(MARKER, '2026-11-12T10:00:00Z\n');
  repo.write('AGENTS.md', 'new release\n');
  for (let i = 0; i < 2; i++) assert.match(seal(repo), /template adoption is in progress since .*--adoption-end/s);
  assert.equal(read(repo, 'AGENTS.md'), 'new release\n');
  assert.equal(guard(repo, 'claude', write(repo, 'AGENTS.md')), null);
  const dirty = end(repo);
  assert.equal(dirty.status, 1);
  assert.match(dirty.stdout, /^- AGENTS\.md: content changed$/m);
  assert.equal(exists(repo, MARKER), true);
  const manifest = JSON.parse(read(repo, MANIFEST));
  manifest.files['AGENTS.md'] = repo.git('hash-object', 'AGENTS.md').stdout.trim();
  repo.write(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  const uncommitted = end(repo);
  assert.equal(uncommitted.status, 1);
  assert.match(uncommitted.stdout, /commit the adoption first/);
  repo.git('commit', '-q', '-m', 'manifest alone', '--', MANIFEST);
  assert.match(end(repo).stdout, /^- AGENTS\.md: the commit that recorded \.agents\/template-manifest\.json does not hold it with that content$/m);
  repo.git('add', '--', 'AGENTS.md');
  repo.git('commit', '-q', '--amend', '--no-edit');
  const done = end(repo);
  assert.equal(done.status, 0, done.stdout + done.stderr);
  assert.equal(exists(repo, MARKER), false);
  assert.equal(seal(repo), '');
  assert.equal(end(repo).status, 0, 'ending twice is harmless');
});

test('an edited manifest is restored from HEAD; one from another release without the marker pauses the seal', (t) => {
  const repo = derived(t);
  const committed = read(repo, MANIFEST);
  const manifest = JSON.parse(committed);
  repo.write('AGENTS.md', 'edited\n');
  manifest.files['AGENTS.md'] = repo.git('hash-object', 'AGENTS.md').stdout.trim();
  repo.write(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  const message = seal(repo);
  assert.match(message, /^- \.agents\/template-manifest\.json: content changed; restored/m);
  assert.match(message, /^- AGENTS\.md: content changed; restored/m);
  assert.equal(read(repo, MANIFEST), committed);
  assert.equal(read(repo, 'AGENTS.md'), FILES['AGENTS.md']);
  repo.write(MANIFEST, `${JSON.stringify({ ...manifest, version: '9.0.0' }, null, 2)}\n`);
  repo.write('AGENTS.md', 'from 9.0.0\n');
  assert.match(seal(repo), /comes from another release .*not checked or restored/s);
  assert.equal(read(repo, 'AGENTS.md'), 'from 9.0.0\n');
});

test('template hooks missing from .claude/settings.json are reported and the file is left as it is', (t) => {
  const repo = derived(t);
  const settings = JSON.parse(read(repo, '.claude/settings.json'));
  const prompt = settings.hooks.UserPromptSubmit[0];
  prompt.hooks = prompt.hooks.filter((hook) => !hook.args[0].includes('check-doc-links.mjs'));
  settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter((group) => group.matcher !== 'Write|Edit|NotebookEdit');
  const text = `${JSON.stringify(settings, null, 2)}\n`;
  repo.write('.claude/settings.json', text);
  const message = seal(repo);
  assert.match(message, /\.claude\/settings\.json no longer registers these template hooks/);
  assert.match(message, /UserPromptSubmit check-doc-links\.mjs/);
  assert.match(message, /PreToolUse \(Write\|Edit\|NotebookEdit\) check-write-scope\.mjs/);
  assert.equal(read(repo, '.claude/settings.json'), text);
  repo.write(EXCEPTIONS, JSON.stringify({ '.scripts/check-doc-links.mjs': 'The project checks links in CI', '.scripts/check-write-scope.mjs': 'Own guard' }));
  assert.equal(seal(repo), '');
  repo.write('.claude/settings.json', '{ not json');
  assert.match(seal(repo), /cannot read \.claude\/settings\.json/);
});

test('file tools may not edit a sealed file; project files, exceptions, the template and an adoption are left alone', (t) => {
  const repo = derived(t);
  const [decision, reason] = guard(repo, 'claude', write(repo, 'AGENTS.md'));
  assert.equal(decision, 'deny');
  assert.match(reason, /^01-meta-guidelines\.md: "AGENTS\.md" is a sealed template file/);
  assert.match(reason, /template repository/);
  assert.match(reason, /\.agents\/template-exceptions\.json/);
  assert.equal(guard(repo, 'claude', { tool_name: 'Edit', tool_input: { file_path: join(repo.dir, '.claude/skills/start/SKILL.md'), old_string: 'a', new_string: 'b' } })?.[0], 'deny');
  assert.equal(guard(repo, 'claude', write(repo, MANIFEST))?.[0], 'deny');
  assert.equal(guard(repo, 'codex', patch('.agents/instructions/01-meta-guidelines.md'))?.[0], 'deny');
  for (const path of ['.docs/plan.md', 'README.md', '.claude/settings.json', '.scripts/own-task.mjs']) {
    assert.equal(guard(repo, 'claude', write(repo, path)), null, path);
  }
  repo.write(EXCEPTIONS, JSON.stringify({ 'AGENTS.md': 'Routes .agents/instructions/20-own.md' }));
  assert.equal(guard(repo, 'claude', write(repo, 'AGENTS.md')), null);
  rmSync(join(repo.dir, EXCEPTIONS));
  repo.write(MARKER, 'now\n');
  assert.equal(guard(repo, 'codex', patch('AGENTS.md')), null);
  assert.deepEqual(copies(repo), []);
});

test('file tools that would pause or narrow the seal ask in Claude Code and are denied in Codex', (t) => {
  const repo = derived(t);
  for (const path of [EXCEPTIONS, MARKER]) {
    const [asked, reason] = guard(repo, 'claude', write(repo, path)) ?? [];
    assert.equal(asked, 'ask', path);
    assert.match(reason, /^01-meta-guidelines\.md: .*the user/, path);
    assert.equal(guard(repo, 'codex', { tool_name: 'apply_patch', tool_input: { command: `*** Begin Patch\n*** Add File: ${path}\n+{}\n*** End Patch\n` } })?.[0], 'deny', path);
  }
  repo.write('.readme/94-template-ci.md', 'only validates the template\n');
  commit(repo);
  assert.equal(guard(repo, 'claude', write(repo, EXCEPTIONS)), null, 'the template is no derived project');
});

test('file tools judge a sealed path by the committed manifest, whatever the working tree holds', (t) => {
  const repo = derived(t);
  const manifest = JSON.parse(read(repo, MANIFEST));
  delete manifest.files['AGENTS.md'];
  repo.write(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.equal(guard(repo, 'claude', write(repo, 'AGENTS.md'))?.[0], 'deny');
  repo.write(MANIFEST, '{');
  assert.equal(guard(repo, 'claude', write(repo, 'AGENTS.md'))?.[0], 'deny');
});
