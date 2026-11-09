import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { markdownWarnings } from '../markdown-rules.mjs';
import { makeRepo, run } from './support.mjs';

const ids = (text) => markdownWarnings(text).map((w) => `${w.line} ${w.id}`);
const T = '# T\n\n';
const OUTER = `${T}\`\`\`markdown\n- item\n\n    \`\`\`js\n    x\n    \`\`\`\n\n* real code\n\`\`\`\n`;
const BELOW = `${T}- a\n\n  \`\`\`js\n  x\n\`\`\`\n* b   \ntext\n\`\`\`\n`;

// Runs --fix on doc.md holding the text; returns the file afterwards.
function fixed(t, text) {
  const repo = makeRepo(t);
  repo.write('doc.md', text);
  const result = run(process.execPath, [join(repo.dir, '.scripts', 'check-markdown.mjs'), '--fix', 'doc.md'], { cwd: repo.dir });
  return { result, text: readFileSync(join(repo.dir, 'doc.md'), 'utf8') };
}

test('markdown rules: a fence is not closed by a fence line indented 4 or more spaces past its container', () => {
  assert.deepEqual(ids(OUTER), []);
  assert.deepEqual(ids(`${T}- a\n\n  \`\`\`js\n  x\n      \`\`\`\n  * y\n  \`\`\`\n`), []);
  assert.deepEqual(ids(`${T}> \`\`\`js\n> x\n>     \`\`\`\n> y\n> \`\`\`\n`), []);
});

test('markdown rules: a fence is closed by a fence line indented up to 3 spaces past its container', () => {
  assert.deepEqual(ids(`${T}- a\n\n  \`\`\`js\n  x\n  \`\`\`\n\ntext\n`), []);
  assert.deepEqual(ids(`${T}- a\n\n  \`\`\`js\n  x\n     \`\`\`\n\ntext\n`), []);
});

test('markdown rules: a line outside the list item ends the fence of the item and may open another', () => {
  assert.deepEqual(ids(BELOW), ['6 MD031', '6 MD032', '7 MD031', '7 MD040']);
  assert.deepEqual(ids(`${T}1. a\n\n   \`\`\`js\n   x\n  \`\`\`\n   * z\n   \`\`\`\n`), ['6 MD031', '6 MD032', '7 MD031', '7 MD040']);
  assert.deepEqual(ids(`${T}- a\n  - b\n\n    \`\`\`js\n    x\n  \`\`\`\n  * c   \n`), ['7 MD031', '8 MD031', '8 MD040']);
});

test('markdown rules: the fence of an item ends at the outside line when blank lines precede it', () => {
  assert.deepEqual(ids(`${T}- a\n\n  \`\`\`js\n  x\n\n- b\n\`\`\`\n`), ['8 MD031', '8 MD032', '9 MD031', '9 MD040']);
  assert.deepEqual(ids(`${T}- a\n\n  \`\`\`js\n  x\n\n\n- b\n\`\`\`\n`), ['9 MD031', '9 MD032', '10 MD031', '10 MD040']);
});

test('markdown rules: only a list item or a quote line ends the fence of an item on a line of its own', () => {
  assert.deepEqual(ids(`${T}- a\n\n  \`\`\`js\n  x\n\ntext\n`), []);
  assert.deepEqual(ids(`${T}- a\n\n  \`\`\`js\n  x\ntext\n`), ['6 MD031', '6 MD032']);
  assert.deepEqual(ids(`${T}- a\n\n  \`\`\`js\n  x\n- b\ntext\n`), ['7 MD031']);
});

test('markdown fix: never edits the code of a fence that a deeper or outer line does not close', (t) => {
  const { result, text } = fixed(t, OUTER);
  assert.deepEqual([text, result.stdout, result.stderr, result.status], [OUTER, '', '', 0]);
});

test('markdown fix: keeps the lines of the fence a line outside the list item opens', (t) => {
  const { text } = fixed(t, BELOW);
  assert.ok(text.includes('\n* b   \ntext\n```'), text);
  assert.ok(text.endsWith('```\n'), text);
});
