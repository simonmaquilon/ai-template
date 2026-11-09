import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { makeRepo, run } from './support.mjs';

const H = '# T\n\n';
const TABLE = '| a |\n| --- |\n';
const fixCommand = (repo, ...args) => run(process.execPath, [join(repo.dir, '.scripts', 'check-markdown.mjs'), '--fix', ...args], { cwd: repo.dir });

// Runs --fix on doc.md holding the text; returns the command result and what the file holds afterwards.
function fixed(t, text) {
  const repo = makeRepo(t);
  repo.write('doc.md', text);
  const result = fixCommand(repo, 'doc.md');
  return { result, text: readFileSync(join(repo.dir, 'doc.md'), 'utf8') };
}

// [name, text, text after --fix]: every one ends without warnings.
const CASES = [
  ['MD004 asterisk bullets become dashes', `${H}* a\n* b\n`, `${H}- a\n- b\n`],
  ['MD004 plus bullets become dashes', `${H}+ a\n  + b\n`, `${H}- a\n  - b\n`],
  ['MD007 nested bullets move to depth * 2', `${H}- a\n    - b\n        - c\n`, `${H}- a\n  - b\n    - c\n`],
  ['MD009 trailing spaces go, a two-space line break stays', `${H}a   \nb  \nc\n`, `${H}a\nb  \nc\n`],
  ['MD012 repeated blank lines collapse into one', `${H}a\n\n\n\nb\n`, `${H}a\n\nb\n`],
  ['MD022 an ATX heading gets a blank line above and below', `${H}a\n## H\nb\n`, `${H}a\n\n## H\n\nb\n`],
  ['MD022 a setext heading gets its blank line below its underline', `${H}Sub\n---\ntext\n`, `${H}Sub\n---\n\ntext\n`],
  ['MD031 a fence gets a blank line before its opening and after its closing', `${H}a\n\`\`\`js\nx\n\`\`\`\nb\n`, `${H}a\n\n\`\`\`js\nx\n\`\`\`\n\nb\n`],
  ['MD032 a list gets a blank line before its first item and after its last', `${H}text\n- a\n- b\n---\n`, `${H}text\n\n- a\n- b\n\n---\n`],
  ['MD040 a fence without language becomes text', `${H}\`\`\`\nx\n\`\`\`\n`, `${H}\`\`\`text\nx\n\`\`\`\n`],
  ['MD047 the file ends with a newline', `${H}a`, `${H}a\n`],
  ['MD058 a table gets a blank line before and after', `${H}a\n| b |\n| --- |\n---\n`, `${H}a\n\n| b |\n| --- |\n\n---\n`],
  ['MD060 rows become compact and the delimiter row keeps its colons', `${H}| a |  b |\n|:--|--:|\n|x|  y  |\n`, `${H}| a | b |\n| :--- | ---: |\n| x | y |\n`],
  ['MD060 the delimiter row keeps centered alignment', `${H}| a | b | c |\n|:-:|-----|:--|\n| 1 | 2 | 3 |\n`, `${H}| a | b | c |\n| :---: | --- | :--- |\n| 1 | 2 | 3 |\n`],
  ['MD060 empty cells stay empty', `${H}| a | b |\n| --- | --- |\n|  | x|\n`, `${H}| a | b |\n| --- | --- |\n| | x |\n`],
  ['MD060 a table without outer pipes keeps its pipe style', `${H}a | b\n--- | ---\nc|d\n`, `${H}a | b\n--- | ---\nc | d\n`],
  ['MD060 a table inside a blockquote keeps the quote', `${H}> | a |\n> | --- |\n> |b |\n`, `${H}> | a |\n> | --- |\n> | b |\n`],
  ['a blank line inserted inside a blockquote carries the > prefix', `${H}> a\n> ## H\n> b\n`, `${H}> a\n>\n> ## H\n>\n> b\n`],
];

for (const [name, input, expected] of CASES) {
  test(`markdown fix: ${name}`, (t) => {
    const { result, text } = fixed(t, input);
    assert.deepEqual([text, result.stdout, result.stderr, result.status], [expected, '', '', 0]);
  });
}

test('markdown fix: MD007 never moves a nested bullet to column 0', (t) => {
  // The engine reads this list whole despite the quote inside the first item, so only the report-only MD029 stays.
  const input = `${H}1. one\n   > quote\n3. three\n   - nested a\n   - nested b\n4. four\n`;
  const { result, text } = fixed(t, input);
  assert.equal(text, input);
  assert.deepEqual([result.status, result.stdout.match(/\[MD\d+\]/g)], [1, ['[MD029]', '[MD029]']]);
});

test('markdown fix: MD007 never moves a nested bullet to column 0 beside a fence inside a numbered item', (t) => {
  const input = `${H}1. a\n\n   \`\`\`sh\n   x\n   \`\`\`\n\n2. b\n   - n\n   - m\n`;
  const { result, text } = fixed(t, input);
  assert.deepEqual([text, result.stdout, result.status], [input, '', 0]);
  assert.ok(!/^- /m.test(text));
});

test('markdown fix: MD060 leaves a row with code or an escaped pipe untouched and still fixes the others', (t) => {
  const rows = ['|`a` |c |', '| a\\|b  |c |'];
  const { result, text } = fixed(t, `${H}| a | b |\n|---|---|\n${rows.join('\n')}\n|x|y |\n`);
  assert.equal(text, `${H}| a | b |\n| --- | --- |\n${rows.join('\n')}\n| x | y |\n`);
  assert.deepEqual([result.status, result.stdout.match(/:(\d+) \[MD060\]/g)], [1, [':5 [MD060]', ':6 [MD060]']]);
});

test('markdown fix: warnings only a person can decide stay reported and the text does not change', (t) => {
  const input = '# A\n\n#### B.\n\n## C\n\n## C\n\n# D\n\n[a](#gone) see https://example.com now\n\n1. a\n3. b\n\na\tb\n\n'
    + '| a | b |\n| --- | --- |\n| 1 | 2\n| 1 | 2 | 3 |\n';
  const { result, text } = fixed(t, input);
  const ids = [...result.stdout.matchAll(/\[(MD\d+)\]/g)].map((m) => m[1]).sort();
  assert.equal(text, input);
  assert.deepEqual([result.status, ids], [1, ['MD001', 'MD010', 'MD024', 'MD025', 'MD026', 'MD029', 'MD034', 'MD051', 'MD055', 'MD056']]);
  assert.equal(fixed(t, 'text\n').text, 'text\n');
});

test('markdown fix: MD007 stays report-only when the bullet would fall before the content column of its parent', (t) => {
  for (const input of [`${H}-   parent\n    - child\n`, `${H}> -   a\n>     - b\n`, `${H}- a\n  -   b\n      - c\n`]) {
    const { result, text } = fixed(t, input);
    assert.equal(text, input);
    assert.deepEqual([result.status, result.stdout.match(/\[MD\d+\]/g)], [1, ['[MD007]']]);
  }
});

test('markdown fix: MD007 still moves a parent and its child together', (t) => {
  const { result, text } = fixed(t, `${H}   - a\n      - b\n`);
  assert.deepEqual([text, result.stdout, result.status], [`${H}- a\n  - b\n`, '', 0]);
});
