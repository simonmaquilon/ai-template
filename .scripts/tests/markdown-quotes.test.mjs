import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { markdownWarnings } from '../markdown/rules.mjs';
import { makeRepo, run } from './support.mjs';

const show = (text) => markdownWarnings(text).map((w) => `${w.line} [${w.id}] ${w.message}`);
const T = '# T\n\n';
const LIST = 'Lists should be surrounded by blank lines';
const PREFIX = 'Ordered list item prefix [Expected: 1; Actual: 2; Style: 1/2/3]';
const HEADS = [`3 [MD032] ${LIST}`, `5 [MD029] ${PREFIX}`, `5 [MD032] ${LIST}`];

// Runs --fix on doc.md holding the text; returns the command result and the file afterwards.
function fixed(t, text) {
  const repo = makeRepo(t);
  repo.write('doc.md', text);
  const result = run(process.execPath, [join(repo.dir, '.scripts', 'check-markdown.mjs'), '--fix', 'doc.md'], { cwd: repo.dir });
  return { result, text: readFileSync(join(repo.dir, 'doc.md'), 'utf8') };
}

test('markdown rules: an ordered item not starting at 1 after a blockquote starts a list, with its nested bullet', () => {
  assert.deepEqual(show(`${T}1. one\n> note\n2. two\n   - n\n`), HEADS);
  assert.deepEqual(show(`${T}1. one\n  > q\n2. two\n   - n\n`), HEADS);
  assert.deepEqual(show(`${T}> note\n2. two\n   - n\n`), [`4 [MD029] ${PREFIX}`, `4 [MD032] ${LIST}`]);
});

test('markdown rules: a line with no block start after a blockquote is still its lazy continuation', () => {
  const doc = `${T}1. one\n> note\nlazy\n2. two\n`;
  assert.deepEqual(show(doc), [`3 [MD032] ${LIST}`, `6 [MD029] ${PREFIX}`, `6 [MD032] ${LIST}`]);
  assert.deepEqual(show(`${T}> note\nlazy\n---\n`), []);
});

test('markdown rules: a quote marker left of the item content column ends the item that held a quote', () => {
  assert.deepEqual(show(`${T}1. One\n   > q\n> outside\n2. Two\n`), [`4 [MD032] ${LIST}`, `6 [MD029] ${PREFIX}`, `6 [MD032] ${LIST}`]);
  const [warning, ...others] = markdownWarnings(`${T}- a\n  > q\n>\n  - x\n`);
  assert.deepEqual([others, warning.line, warning.id], [[], 6, 'MD007']);
  assert.match(warning.message, /Expected: 0; Actual: 2/);
});

test('markdown rules: a lazy continuation of a quoted list item keeps the list and the quote open', () => {
  assert.deepEqual(show(`${T}> - a\nlazy\n`), []);
  assert.deepEqual(show(`${T}> - a\nlazy\n> - b\n`), []);
  assert.deepEqual(show(`${T}> 1. a\nlazy\n\ntext\n`), []);
});

test('markdown fix: a nested bullet after an ordered item that follows a blockquote keeps its column', (t) => {
  const { result, text } = fixed(t, `${T}1. one\n> note\n2. two\n   - n\n`);
  assert.equal(text, `${T}1. one\n\n> note\n\n2. two\n   - n\n`);
  assert.deepEqual([result.status, result.stdout.match(/\[MD\d+\]/g)], [1, ['[MD029]']]);
});

test('markdown fix: a lazy continuation of a quoted list item stays inside the quote', (t) => {
  const input = `${T}> - a\nlazy\n`;
  const { result, text } = fixed(t, input);
  assert.deepEqual([text, result.stdout, result.stderr, result.status], [input, '', '', 0]);
});
