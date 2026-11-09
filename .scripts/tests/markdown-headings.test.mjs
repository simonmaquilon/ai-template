import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownWarnings } from '../markdown/rules.mjs';

const show = (text) => markdownWarnings(text).map((w) => `${w.line} [${w.id}] ${w.message}`);
const M041 = 'First line in a file should be a top-level heading';
const M051 = 'Link fragments should be valid';

test('markdown rules: MD041 a document that starts with a top-level heading passes', () => {
  assert.deepEqual(show('# T\n\ntext\n'), []);
  assert.deepEqual(show('Title\n=====\n\ntext\n'), []);
  assert.deepEqual(show('<!-- note -->\n\n# T\n'), []);
  assert.deepEqual(show('<h1 align="center">T</h1>\n\ntext\n'), []);
});

test('markdown rules: MD041 a document without a top-level heading first fails on its first line', () => {
  assert.deepEqual(show('text\n'), [`1 [MD041] ${M041}`]);
  assert.deepEqual(show('\n## T\n'), [`2 [MD041] ${M041}`]);
  assert.deepEqual(show('- a\n'), [`1 [MD041] ${M041}`]);
  assert.deepEqual(show('> # T\n'), [`1 [MD041] ${M041}`]);
});

test('markdown rules: MD041 a title: key in the front matter needs no heading', () => {
  assert.deepEqual(show('---\ntitle: X\n---\ntext\n'), []);
  assert.deepEqual(show('---\n"Title" = "X"\n---\ntext\n'), []);
});

test('markdown rules: MD041 a name: key in the front matter needs no heading', () => {
  assert.deepEqual(show('---\nname: x\ndescription: y\n---\ntext\n'), []);
  assert.deepEqual(show('---\n"name": "x"\n---\ntext\n'), []);
});

test('markdown rules: MD041 front matter with only a description: still needs a heading', () => {
  assert.deepEqual(show('---\ndescription: y\n---\ntext\n'), [`4 [MD041] ${M041}`]);
  assert.deepEqual(show('---\ndescription: y\n---\n# T\n'), []);
});

test('markdown rules: MD041 an empty file gives nothing', () => {
  assert.deepEqual(show(''), []);
  assert.deepEqual(show('---\ndescription: y\n---\n'), []);
});

test('markdown rules: MD051 a link to a heading with accents matches its slug', () => {
  assert.deepEqual(show('# Área útil\n\n[a](#área-útil)\n[b](#area-util)\n'), [`4 [MD051] ${M051}`]);
});

test('markdown rules: MD051 slugs drop punctuation except hyphens and underscores, and keep case-insensitive text', () => {
  const doc = '# Hello, World! snake_case - dash\n\n[a](#hello-world-snake_case---dash)\n[b](#hello-world)\n';
  assert.deepEqual(show(doc), [`4 [MD051] ${M051}`]);
});

test('markdown rules: MD051 a heading with code or a link keeps only its visible text', () => {
  const doc = '# Use `npm run` now\n\n## See [the docs](https://x.com/a)\n\n[a](#use-npm-run-now)\n[b](#see-the-docs)\n[c](#https)\n';
  assert.deepEqual(show(doc), [`7 [MD051] ${M051}`]);
});

test('markdown rules: MD051 repeated headings get -1, -2 suffixes', () => {
  const doc = '# T\n\n## B\n\n## B\n\n[a](#b)\n[b](#b-1)\n[c](#b-2)\n';
  assert.deepEqual(show(doc), ['5 [MD024] Multiple headings with the same content', `9 [MD051] ${M051}`]);
});

test('markdown rules: MD051 a setext heading provides its anchor', () => {
  assert.deepEqual(show('Title\n=====\n\n[a](#title)\n[b](#missing)\n'), [`5 [MD051] ${M051}`]);
});

test('markdown rules: MD051 an HTML id or an anchor name provides its anchor', () => {
  const doc = '# T\n\n<a id="x"></a>\n<a name="n"></a>\n<div id=\'d\'>\n\n</div>\n\n[a](#x) [b](#n) [c](#d) [e](#y)\n';
  assert.deepEqual(show(doc), [`9 [MD051] ${M051}`]);
});

test('markdown rules: MD051 #top always resolves', () => {
  assert.deepEqual(show('# T\n\n[a](#top)\n'), []);
});

test('markdown rules: MD051 links inside code spans and fences are ignored', () => {
  const doc = '# T\n\n`[a](#gone)`\n\n```md\n[b](#gone)\n```\n\n    [c](#gone)\n';
  assert.deepEqual(show(doc), []);
});

test('markdown rules: MD051 other targets are not same-file anchors', () => {
  const doc = '# T\n\n[a](other.md#x) [b](https://x.com/#y) ![c](#z) [d](#L10) [e](#)\n';
  assert.deepEqual(show(doc), []);
});

test('markdown rules: MD051 reference definitions, titles and angle brackets are read', () => {
  const doc = '# T\n\n[a]: #gone\n[b]: #t\n\n[c](#gone "title")\n[d](<#t>)\n';
  assert.deepEqual(show(doc), [`3 [MD051] ${M051}`, `6 [MD051] ${M051}`]);
});

test('markdown rules: MD051 a link that differs only in case says what it expected', () => {
  assert.deepEqual(show('# Title\n\n[a](#Title)\n'), [`3 [MD051] ${M051} [Expected: #title; Actual: #Title]`]);
});

test('markdown rules: MD051 links inside HTML blocks are ignored, and their ids still count', () => {
  assert.deepEqual(show('# T\n\n<div>\n[a](#nope)\n</div>\n'), []);
  assert.deepEqual(show('# T\n\n<div>[b](#x)</div>\n'), []);
  assert.deepEqual(show('# T\n\n<div id="y">[b](#x)</div>\n\n[c](#y) [d](#x)\n'), [`5 [MD051] ${M051}`]);
  assert.deepEqual(show('# T\n\n<div>\n\n[c](#x)\n\n</div>\n'), [`5 [MD051] ${M051}`]);
});

test('markdown rules: MD051 escapes control and bidi characters of the text its message copies', () => {
  const doc = '# T\n\n<a id="X\x1b]0;pwned\x07"></a> <a id="Y\u202e"></a>\n\n[a](#x\x1b]0;pwned\x07) [b](#y\u202e)\n';
  const expected = (id) => `${M051} [Expected: #${id}; Actual: #${id.toLowerCase()}]`;
  assert.deepEqual(show(doc), [`5 [MD051] ${expected('X\\u001b]0;pwned\\u0007')}`, `5 [MD051] ${expected('Y\\u202e')}`]);
});
