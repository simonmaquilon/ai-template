import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { makeRepo, run } from './support.mjs';

const H = '# T\n\n';
const script = (repo) => join(repo.dir, '.scripts', 'check-markdown.mjs');
const fix = (repo, ...args) => run(process.execPath, [script(repo), '--fix', ...args], { cwd: repo.dir });
const read = (repo, path, encoding) => readFileSync(join(repo.dir, path), encoding);
const attributes = (repo) => repo.write('.gitattributes', [
  'vendor/** linguist-vendored', 'vendor/kept/** markdown-structure', 'gen/** linguist-generated', 'never/** -markdown-structure',
  '.agents/skills/** linguist-vendored', '.agents/skills/commit/** markdown-structure', ''].join('\n'));

test('markdown fix: keeps a BOM', (t) => {
  const repo = makeRepo(t);
  repo.write('doc.md', `\uFEFF${H}* a\n`);
  assert.equal(fix(repo, 'doc.md').status, 0);
  assert.deepEqual([...read(repo, 'doc.md').subarray(0, 4)], [0xef, 0xbb, 0xbf, 0x23]);
  assert.equal(read(repo, 'doc.md', 'utf8'), `\uFEFF${H}- a\n`);
});

test('markdown fix: keeps CRLF line endings, also on the lines it inserts and the final newline it adds', (t) => {
  const repo = makeRepo(t);
  repo.write('doc.md', '# T\r\n## H\r\n* a   \r\n\r\n\r\n\r\ntext');
  assert.equal(fix(repo, 'doc.md').status, 0);
  assert.equal(read(repo, 'doc.md', 'utf8'), '# T\r\n\r\n## H\r\n\r\n- a\r\n\r\ntext\r\n');
});

test('markdown fix: keeps LF line endings', (t) => {
  const repo = makeRepo(t);
  repo.write('doc.md', '# T\n## H\n* a');
  fix(repo, 'doc.md');
  assert.equal(read(repo, 'doc.md', 'utf8'), '# T\n\n## H\n\n- a\n');
});

test('markdown fix: is idempotent, a second run gives the same file and prints nothing', (t) => {
  const repo = makeRepo(t);
  repo.write('doc.md', '# T\n## H\n* a   \n    + b\ntext\n```\nx\n```\n| a |\n|:-|\n|b  |\n\n\n\n> q\n> ## Q\n> r');
  const first = fix(repo, 'doc.md');
  const once = read(repo, 'doc.md', 'utf8');
  const second = fix(repo, 'doc.md');
  assert.deepEqual([first.status, second.status, second.stdout, read(repo, 'doc.md', 'utf8')], [0, 0, '', once]);
});

test('markdown fix: never touches front matter, fenced code, or indented code', (t) => {
  const repo = makeRepo(t);
  const keep = '---\ntitle: x   \ntags:\n    - a\n---\n# T\n\n```\n* a   \n\n\n\n    - b\n```text\n```\n\ntext\n\n    code   \n    * x\n';
  repo.write('doc.md', `${keep}\n* b\n`);
  assert.equal(fix(repo, 'doc.md').status, 0);
  const after = read(repo, 'doc.md', 'utf8');
  assert.equal(after, `${keep.replace('```\n* a', '```text\n* a')}\n- b\n`);
});

test('markdown fix: exit codes follow the warnings that remain', (t) => {
  const repo = makeRepo(t);
  repo.write('ok.md', `${H}* a\n`);
  repo.write('rest.md', '# A\n\n* a\n\n#### B\n');
  const code = (...args) => fix(repo, ...args);
  const ok = code('ok.md');
  assert.deepEqual([ok.status, ok.stdout, ok.stderr], [0, '', '']);
  const rest = code('rest.md');
  assert.deepEqual([rest.status, rest.stdout], [1, 'rest.md:5 [MD001] Heading levels should only increment by one level at a time [Expected: h2; Actual: h4]\n']);
  const gone = code('ok.md', 'gone.md');
  assert.deepEqual([gone.status, gone.stdout, gone.stderr], [2, '', 'gone.md: not checked; ENOENT\n']);
  const both = code('gone.md', 'rest.md');
  assert.equal(both.status, 1);
});

test('markdown fix: without files it prints a usage line that names --fix and exits 2', (t) => {
  const repo = makeRepo(t);
  for (const args of [[], ['--fix']]) {
    const result = run(process.execPath, [script(repo), ...args], { cwd: repo.dir });
    assert.deepEqual([result.status, result.stdout], [2, '']);
    assert.match(result.stderr, /^Usage: .*--fix/);
  }
});

test('markdown fix: --hook stays informative, exits 0 and modifies nothing', (t) => {
  const repo = makeRepo(t);
  repo.write('doc.md', `${H}* a\n`);
  const input = JSON.stringify({ tool_input: { file_path: join(repo.dir, 'doc.md') } });
  const result = run(process.execPath, [script(repo), '--hook', '--fix'], { cwd: repo.dir, input });
  assert.deepEqual([result.status, result.stderr, read(repo, 'doc.md', 'utf8')], [0, '', `${H}* a\n`]);
});

test('markdown fix: refuses a vendored or generated file without markdown-structure, and one marked -markdown-structure', (t) => {
  const repo = makeRepo(t);
  attributes(repo);
  const names = ['vendor/v.md', 'gen/g.md', 'never/n.md'];
  for (const name of names) repo.write(name, `${H}* a\n`);
  const result = fix(repo, ...names);
  assert.equal(result.status, 1);
  for (const name of names) {
    assert.equal(read(repo, name, 'utf8'), `${H}* a\n`, name);
    assert.ok(result.stdout.includes(`${name}:3 [MD004]`), name);
    assert.ok(result.stderr.includes(`${name}: not modified;`), name);
  }
});

test('markdown fix: fixes a vendored file that sets markdown-structure', (t) => {
  const repo = makeRepo(t);
  attributes(repo);
  repo.write('vendor/kept/k.md', `${H}* a\n`);
  const result = fix(repo, 'vendor/kept/k.md');
  assert.deepEqual([result.status, result.stdout, result.stderr, read(repo, 'vendor/kept/k.md', 'utf8')], [0, '', '', `${H}- a\n`]);
});

test('markdown fix: --fix --all fixes the files the check lints and exits 0', (t) => {
  const repo = makeRepo(t);
  attributes(repo);
  repo.write('docs/a.md', `${H}* a\n`);
  repo.write('vendor/kept/k.md', `${H}+ a\n`);
  repo.write('vendor/v.md', `${H}* a\n`);
  const result = fix(repo, '--all');
  assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', '']);
  assert.deepEqual(['docs/a.md', 'vendor/kept/k.md', 'vendor/v.md'].map((name) => read(repo, name, 'utf8')),
    [`${H}- a\n`, `${H}- a\n`, `${H}* a\n`]);
});

test('markdown fix: --fix --all leaves a new skill under .agents/skills without markdown-structure untouched', (t) => {
  const repo = makeRepo(t);
  attributes(repo);
  repo.write('.agents/skills/new/SKILL.md', `${H}* a   \n`);
  repo.write('.agents/skills/new/references/r.md', 'text\n* b\n');
  repo.write('.agents/skills/commit/SKILL.md', `${H}* a\n`);
  const result = fix(repo, '--all');
  assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', '']);
  assert.equal(read(repo, '.agents/skills/commit/SKILL.md', 'utf8'), `${H}- a\n`);
  assert.equal(read(repo, '.agents/skills/new/SKILL.md', 'utf8'), `${H}* a   \n`);
  assert.equal(read(repo, '.agents/skills/new/references/r.md', 'utf8'), 'text\n* b\n');
  const named = fix(repo, '.agents/skills/new/SKILL.md');
  assert.equal(named.status, 1);
  assert.equal(read(repo, '.agents/skills/new/SKILL.md', 'utf8'), `${H}* a   \n`);
});

test('markdown fix: does not rewrite a file that is not valid UTF-8', (t) => {
  const repo = makeRepo(t);
  repo.write('doc.md', Buffer.from(`${H}* caf\xe9\n`, 'latin1'));
  const before = read(repo, 'doc.md');
  const result = fix(repo, 'doc.md');
  assert.deepEqual([result.status, read(repo, 'doc.md').equals(before)], [1, true]);
  assert.ok(result.stderr.includes('doc.md: not modified;'));
});
