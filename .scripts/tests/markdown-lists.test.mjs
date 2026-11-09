import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownWarnings } from '../markdown-rules.mjs';

const show = (text) => markdownWarnings(text).map((w) => `${w.line} [${w.id}] ${w.message}`);
const T = '# T\n\n';

test('markdown rules: a blockquote inside an ordered item keeps the list', () => {
  assert.deepEqual(show(`${T}1. a\n   > quote\n2. b\n3. c\n   - x\n   - y\n4. d\n`), []);
  assert.deepEqual(show(`${T}1. a\n   > quote\n\n2. b\n   - x\n   - y\n\n3. c\n`), []);
});

test('markdown rules: a fence inside an ordered item keeps its numbering', () => {
  const fenced = '   > ```bash\n   > x\n   > ```\n';
  assert.deepEqual(show(`${T}1. a\n2. b\n3. c\n4. d\n\n${fenced}\n5. e\n`), []);
  assert.deepEqual(show(`${T}1. a\n2. b\n3. c\n4. d:\n\n   \`\`\`bash\n   x\n   \`\`\`\n\n5. e\n`), []);
});

test('markdown rules: a blockquote inside a bullet item is part of the item, and ends it last', () => {
  assert.deepEqual(show(`${T}- a\n  > q\n\ntext\n`), []);
  assert.deepEqual(show(`${T}- a\n  - b\n    > q\n  - c\n- d\n`), []);
  assert.deepEqual(show(`${T}- a\n  > q\n  - x\n  - y\n- b\n`), []);
});

test('markdown rules: a list inside a blockquote inside an item is nested, not a list of its own', () => {
  assert.deepEqual(show(`${T}- a\n  > q\n  > - x\n  > - y\n- b\n`), []);
  assert.deepEqual(show(`${T}> 1. a\n>    > q\n> 2. b\n>    - x\n`), []);
});

test('markdown rules: a blockquote inside an item keeps its nested bullets at their depth', () => {
  const [warning, ...others] = markdownWarnings(`${T}- a\n  > q\n  - x\n      - y\n`);
  assert.deepEqual([others, warning.line, warning.id], [[], 6, 'MD007']);
  assert.match(warning.message, /Expected: 4; Actual: 6/);
  assert.deepEqual(warning.fix, { op: 'edit', at: 0, remove: 6, insert: '    ' });
});
