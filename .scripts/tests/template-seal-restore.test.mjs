import assert from 'node:assert/strict';
import { chmodSync, lstatSync, readFileSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS } from './support.mjs';
import { DRIFT, EXCEPTIONS, FILES, copies, derived, exists, read, releaseWith, seal } from './template-seal-fixture.mjs';

const STAMP = /^\d{8}T\d{9}Z(?:-\d+)?$/;
const mode = (repo, path) => lstatSync(join(repo.dir, path)).mode & 0o777;

test('a derived project whose sealed files match the manifest gets no message and no copies', (t) => {
  const repo = derived(t);
  assert.equal(seal(repo), '');
  assert.deepEqual(copies(repo), []);
});

test('an edited sealed file is restored, its changed version saved under .temp/template-drift/<UTC>/, and the agent told', (t) => {
  const repo = derived(t);
  repo.write('AGENTS.md', '# AGENTS.md\nedited by hand\n');
  repo.write('.agents/instructions/02-change-workflow.md', 'rewritten\n');
  const message = seal(repo);
  assert.match(message, /^Template seal \(01-meta-guidelines\.md\)/);
  assert.match(message, /in their language/);
  assert.match(message, /^- AGENTS\.md: content changed; restored, the changed version saved$/m);
  assert.match(message, /^- \.agents\/instructions\/02-change-workflow\.md: content changed; restored/m);
  assert.equal(read(repo, 'AGENTS.md'), FILES['AGENTS.md']);
  const saved = copies(repo);
  assert.equal(saved.length, 2);
  const [stamp] = saved[0].split('/');
  assert.match(stamp, STAMP);
  assert.ok(message.includes(`${DRIFT}/${stamp}/`), message);
  assert.equal(read(repo, `${DRIFT}/${stamp}/AGENTS.md`), '# AGENTS.md\nedited by hand\n');
  assert.equal(read(repo, `${DRIFT}/${stamp}/.agents/instructions/02-change-workflow.md`), 'rewritten\n');
  assert.equal(seal(repo), '', 'a second prompt finds nothing to restore');
  assert.equal(repo.git('status', '--porcelain').stdout, '');
});

test('line endings that .gitattributes normalizes are no drift', (t) => {
  const repo = derived(t);
  repo.write('AGENTS.md', FILES['AGENTS.md'].replace(/\n/g, '\r\n'));
  assert.equal(seal(repo), '');
});

test('a deleted sealed file, also with its folder, is restored from the local blob', (t) => {
  const repo = derived(t);
  rmSync(join(repo.dir, 'AGENTS.md'));
  rmSync(join(repo.dir, '.agents/instructions'), { recursive: true });
  const message = seal(repo);
  assert.match(message, /^- AGENTS\.md: deleted; restored$/m);
  assert.match(message, /^- \.agents\/instructions\/01-meta-guidelines\.md: deleted; restored$/m);
  assert.equal(read(repo, '.agents/instructions/01-meta-guidelines.md'), FILES['.agents/instructions/01-meta-guidelines.md']);
  assert.deepEqual(copies(repo), []);
  assert.equal(repo.git('status', '--porcelain').stdout, '');
});

test('an executable bit changed either way is restored, and the copy keeps the changed mode', { skip: WINDOWS }, (t) => {
  const repo = derived(t);
  chmodSync(join(repo.dir, '.agents/skills/security-audit/check.cjs'), 0o644);
  chmodSync(join(repo.dir, 'AGENTS.md'), 0o755);
  const message = seal(repo);
  assert.match(message, /^- AGENTS\.md: executable bit changed; restored/m);
  assert.match(message, /^- \.agents\/skills\/security-audit\/check\.cjs: executable bit changed; restored/m);
  assert.equal(mode(repo, '.agents/skills/security-audit/check.cjs') & 0o100, 0o100);
  assert.equal(mode(repo, 'AGENTS.md') & 0o111, 0);
  const [stamp] = copies(repo)[0].split('/');
  assert.equal(mode(repo, `${DRIFT}/${stamp}/AGENTS.md`) & 0o100, 0o100);
  assert.equal(repo.git('status', '--porcelain').stdout, '');
});

test('the .claude/skills link is restored when replaced by a file or pointed elsewhere', { skip: WINDOWS }, (t) => {
  const repo = derived(t);
  rmSync(join(repo.dir, '.claude/skills'));
  repo.write('.claude/skills', 'not a link\n');
  assert.match(seal(repo), /^- \.claude\/skills: the symbolic link was replaced by a file; restored/m);
  assert.equal(readlinkSync(join(repo.dir, '.claude/skills')), '../.agents/skills');
  rmSync(join(repo.dir, '.claude/skills'));
  symlinkSync('../.agents', join(repo.dir, '.claude/skills'));
  assert.match(seal(repo), /^- \.claude\/skills: symbolic link changed; restored/m);
  assert.equal(readlinkSync(join(repo.dir, '.claude/skills')), '../.agents/skills');
  const saved = copies(repo);
  assert.equal(saved.length, 2);
  assert.equal(readFileSync(join(repo.dir, DRIFT, saved.find((path) => lstatSync(join(repo.dir, DRIFT, path)).isFile())), 'utf8'), 'not a link\n');
  assert.equal(repo.git('status', '--porcelain').stdout, '');
});

test('project-owned files and files the project added are never touched', (t) => {
  const repo = derived(t);
  const edits = {
    '.docs/plan.md': '# Plan\nfilled in\n',
    'README.md': '# Project\n',
    '.gitignore': '.temp/\nnode_modules/\n',
    '.claude/settings.json': read(repo, '.claude/settings.json').replace('"Concise"', '"Explanatory"'),
    '.scripts/own-task.mjs': 'console.log("project");\n',
    '.agents/skills/mine/SKILL.md': '# Mine\n',
  };
  for (const [path, text] of Object.entries(edits)) repo.write(path, text);
  assert.equal(seal(repo), '');
  for (const [path, text] of Object.entries(edits)) assert.equal(read(repo, path), text, path);
  assert.deepEqual(copies(repo), []);
});

test('a path or folder in the exceptions list is the project\'s; an invalid list pauses the seal and says why', (t) => {
  const repo = derived(t);
  repo.write(EXCEPTIONS, JSON.stringify({ 'AGENTS.md': 'Routes .agents/instructions/20-own.md', '.agents/instructions/': 'Own rules' }));
  repo.write('AGENTS.md', 'project routing\n');
  repo.write('.agents/instructions/01-meta-guidelines.md', 'project meta\n');
  assert.equal(seal(repo), '');
  assert.equal(read(repo, 'AGENTS.md'), 'project routing\n');
  for (const invalid of ['{"AGENTS.md": ""}', '["AGENTS.md"]', '{', '{".agents/template-manifest.json": "mine"}', '{"../x": "out"}']) {
    repo.write(EXCEPTIONS, invalid);
    const message = seal(repo);
    assert.match(message, /\.agents\/template-exceptions\.json is not valid/, invalid);
    assert.match(message, /not checked or restored/, invalid);
    assert.equal(read(repo, 'AGENTS.md'), 'project routing\n', invalid);
  }
  assert.deepEqual(copies(repo), []);
});

test('a sealed file whose blob is not in the local git repository is reported and left as it is', (t) => {
  const missing = '0123456789abcdef0123456789abcdef01234567';
  const repo = derived(t, { manifest: (files) => ({ ...files, '.agents/instructions/02-change-workflow.md': missing, 'AGENTS.md': '--batch' }) });
  releaseWith(repo, { '.agents/instructions/02-change-workflow.md': missing });
  const message = seal(repo);
  assert.match(message, /^- AGENTS\.md: content changed; not restored: its manifest entry is not a blob id$/m);
  assert.match(message, /^- \.agents\/instructions\/02-change-workflow\.md: content changed; not restored: blob 0123456789ab is not in the local git repository/m);
  assert.equal(read(repo, '.agents/instructions/02-change-workflow.md'), FILES['.agents/instructions/02-change-workflow.md']);
  assert.deepEqual(copies(repo), []);
});

test('a sealed path behind a link that leaves the repository is reported, never followed or written', { skip: WINDOWS }, (t) => {
  const repo = derived(t);
  const outside = join(repo.dir, '..', `${repo.dir.split(/[\\/]/).pop()}-outside`);
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  rmSync(join(repo.dir, '.agents/instructions'), { recursive: true });
  repo.write('../' + outside.split(/[\\/]/).pop() + '/01-meta-guidelines.md', 'outside\n');
  symlinkSync(outside, join(repo.dir, '.agents/instructions'));
  const message = seal(repo);
  assert.match(message, /^- \.agents\/instructions\/01-meta-guidelines\.md: a folder on its path is a link or a file; not restored/m);
  assert.equal(readFileSync(join(outside, '01-meta-guidelines.md'), 'utf8'), 'outside\n');
  assert.equal(exists(repo, '.agents/instructions/02-change-workflow.md'), false);
});

test('codex: its prompt hook restores the same way', (t) => {
  const repo = derived(t);
  repo.write('AGENTS.md', 'edited\n');
  assert.match(seal(repo, 'codex'), /^- AGENTS\.md: content changed; restored/m);
  assert.equal(read(repo, 'AGENTS.md'), FILES['AGENTS.md']);
});
