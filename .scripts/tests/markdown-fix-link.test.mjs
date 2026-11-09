import assert from 'node:assert/strict';
import { linkSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, makeRepo, run } from './support.mjs';

const H = '# T\n\n';
const read = (repo, path) => readFileSync(join(repo.dir, path), 'utf8');
const fix = (repo, cwd, ...args) => run(process.execPath, [join(repo.dir, '.scripts', 'check-markdown.mjs'), '--fix', ...args], { cwd });

// A junction on Windows, which needs no privilege; other systems ignore the type and create a symbolic link.
test('markdown fix: refuses a vendored file reached through a symbolic link to its folder', (t) => {
  const repo = makeRepo(t);
  repo.write('.gitattributes', '.agents/skills/** linguist-vendored\n');
  repo.write('.agents/skills/security-audit/SKILL.md', `${H}* a\n`);
  repo.write('docs/keep.md', 'text\n');
  symlinkSync(join(repo.dir, '.agents', 'skills', 'security-audit'), join(repo.dir, 'docs', 'linkdir'), 'junction');
  const result = fix(repo, repo.dir, 'docs/linkdir/SKILL.md');
  assert.equal(read(repo, '.agents/skills/security-audit/SKILL.md'), `${H}* a\n`);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('docs/linkdir/SKILL.md: not modified;'), result.stderr);
});

test('markdown fix: still fixes a regular file named with ./, ../ or an absolute path', (t) => {
  const repo = makeRepo(t);
  const names = ['a.md', 'b.md', 'docs/c.md'];
  for (const name of names) repo.write(name, `${H}* a\n`);
  const docs = join(repo.dir, 'docs');
  const results = [fix(repo, repo.dir, './a.md'), fix(repo, docs, '../b.md'), fix(repo, repo.dir, join(repo.dir, 'docs', 'c.md'))];
  assert.deepEqual(results.map((r) => [r.status, r.stdout, r.stderr]), names.map(() => [0, '', '']));
  assert.deepEqual(names.map((name) => read(repo, name)), names.map(() => `${H}- a\n`));
});

test('markdown fix: leaves the target of a symbolic link to a file unchanged and says why', (t) => {
  const repo = makeRepo(t);
  repo.write('real.md', `${H}* a\n`);
  symlinkSync('real.md', join(repo.dir, 'link.md'));
  const result = fix(repo, repo.dir, 'link.md');
  assert.equal(read(repo, 'real.md'), `${H}* a\n`);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('link.md: not modified; symbolic link'), result.stderr);
});

test('markdown fix: leaves a file unchanged outside a repository and says why', (t) => {
  const dir = mkdtempSync(join(ROOT, '.temp', 'fix-outside-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'doc.md'), `${H}* a\n`);
  const result = run(process.execPath, [join(ROOT, '.scripts', 'check-markdown.mjs'), '--fix', 'doc.md'], { cwd: dir });
  assert.equal(readFileSync(join(dir, 'doc.md'), 'utf8'), `${H}* a\n`);
  assert.ok(result.stderr.includes('doc.md: not modified; file attributes unavailable'), result.stderr);
});

test('markdown fix: refuses a hard link to a file that the attributes exclude', (t) => {
  const repo = makeRepo(t);
  repo.write('.gitattributes', '.agents/skills/** linguist-vendored\n');
  repo.write('.agents/skills/security-audit/SKILL.md', `${H}* a\n`);
  repo.write('docs/keep.md', 'text\n');
  linkSync(join(repo.dir, '.agents', 'skills', 'security-audit', 'SKILL.md'), join(repo.dir, 'docs', 'hard.md'));
  const result = fix(repo, repo.dir, 'docs/hard.md');
  assert.equal(read(repo, '.agents/skills/security-audit/SKILL.md'), `${H}* a\n`);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('docs/hard.md: not modified; hard link'), result.stderr);
});
