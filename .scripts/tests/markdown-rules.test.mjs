import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownWarnings } from '../markdown/rules.mjs';

const show = (text) => markdownWarnings(text).map((w) => `${w.line} [${w.id}] ${w.message}`);
const COL = 'Table column style [Table pipe ';
const TABLE = '| a |\n| --- |\n';
const M022 = 'Headings should be surrounded by blank lines [Expected: 1; Actual: 0; ';
const M056 = 'Table column count [Expected: ';
const T = '# T\n\n';
const M055 = 'Table pipe style [Expected: leading_and_trailing; Actual: leading_only; Missing trailing pipe]';

// [label starting with the rule id, text, expected line, expected message]: that one warning and no other.
const CASES = [
  ['MD001', '# A\n\n#### B\n', 3, 'Heading levels should only increment by one level at a time [Expected: h2; Actual: h4]'],
  ['MD004 asterisk', `${T}* a\n`, 3, 'Unordered list style [Expected: dash; Actual: asterisk]'],
  ['MD004 plus', `${T}+ a\n`, 3, 'Unordered list style [Expected: dash; Actual: plus]'],
  ['MD007', `${T}- a\n    - b\n`, 4, 'Unordered list indentation [Expected: 2; Actual: 4]'],
  ['MD009', `${T}a   \n`, 3, 'Trailing spaces [Expected: 0 or 2; Actual: 3]'],
  ['MD010', `${T}a\tb\tc\n`, 3, 'Hard tabs [Column: 2]'],
  ['MD012', `${T}a\n\n\nb\n`, 5, 'Multiple consecutive blank lines [Expected: 1; Actual: 2]'],
  ['MD012 phantom last line', `${T}a\n\n`, 5, 'Multiple consecutive blank lines [Expected: 1; Actual: 2]'],
  ['MD022 above', `${T}a\n## H\n\nb\n`, 4, `${M022}Above]`],
  ['MD022 below', '# H\ntext\n', 1, `${M022}Below]`],
  ['MD024', '# A\n\n## B\n\n## B\n', 5, 'Multiple headings with the same content'],
  ['MD025', '# A\n\n# B\n', 3, 'Multiple top-level headings in the same document'],
  ['MD026', '# A.\n', 1, "Trailing punctuation in heading [Punctuation: '.']"],
  ['MD029', `${T}1. a\n2. b\n4. c\n`, 5, 'Ordered list item prefix [Expected: 3; Actual: 4; Style: 1/2/3]'],
  ['MD031 opening fence', `${T}a\n\`\`\`js\nx\n\`\`\`\n`, 4, 'Fenced code blocks should be surrounded by blank lines'],
  ['MD031 closing fence', `${T}\`\`\`js\nx\n\`\`\`\nb\n`, 5, 'Fenced code blocks should be surrounded by blank lines'],
  ['MD032 above', `${T}text\n- a\n`, 4, 'Lists should be surrounded by blank lines'],
  ['MD032 below', `${T}- a\n---\n`, 3, 'Lists should be surrounded by blank lines'],
  ['MD034', `${T}see https://example.com now\n`, 3, 'Bare URL used'],
  ['MD040', `${T}\`\`\`\nx\n\`\`\`\n`, 3, 'Fenced code blocks should have a language specified'],
  ['MD047', `${T}a`, 3, 'Files should end with a single newline character'],
  ['MD055', `${T}| a | b |\n| --- | --- |\n| 1 | 2\n`, 5, M055],
  ['MD056 many', `${T}${TABLE}| 1 | 2 |\n`, 5, `${M056}1; Actual: 2; Too many cells, extra data will be missing]`],
  ['MD056 few', `${T}| a | b |\n| --- | --- |\n| 1 |\n`, 5, `${M056}2; Actual: 1; Too few cells, row will be missing data]`],
  ['MD058 above', `${T}a\n| b |\n| --- |\n`, 4, 'Tables should be surrounded by blank lines'],
  ['MD058 below', `${T}${TABLE}---\n`, 4, 'Tables should be surrounded by blank lines'],
  ['MD060 missing right', `${T}${TABLE}|b |\n`, 5, `${COL}is missing space to the right for style "compact"]`],
  ['MD060 extra right', `${T}${TABLE}|  b |\n`, 5, `${COL}has extra space to the right for style "compact"]`],
  ['MD060 missing left', `${T}${TABLE}| b|\n`, 5, `${COL}is missing space to the left for style "compact"]`],
  ['MD060 extra left', `${T}${TABLE}| b  |\n`, 5, `${COL}has extra space to the left for style "compact"]`],
  ['MD060 delimiter', `${T}| a |\n| ----- |\n`, 4, 'Table column style [Delimiter cell should be --- for style "compact"]'],
  ['MD009 after front matter', '---\nname: x\n---\na   \n', 4, 'Trailing spaces [Expected: 0 or 2; Actual: 3]'],
];

for (const [label, text, line, message] of CASES) {
  test(`markdown rules: ${label}`, () => {
    assert.deepEqual(show(text), [`${line} [${label.slice(0, 5)}] ${message}`]);
  });
}

test('markdown rules: a realistic clean document yields nothing', () => {
  const doc = [
    '---', 'title: Sample', '---', '# Title', '', '<!-- A comment line. -->', '',
    'Intro with a line break  ', 'and a second line.', '', '## Steps', '', '1. Install:', '',
    '   ```bash', '   npm install', '   ```', '', '   - Check the output.', '', '2. Run it.', '',
    'Items:', '', '- Parent', '  - Child', '    - Grandchild', '- Lazy item', 'continues here', '',
    '| Name | Value |', '| :--- | ---: |', '| a | b |', '',
    '[![CI](https://x.com/b.svg)](https://x.com/ci)', '', 'Read the [long', 'stream](https://x.com/a) and more.', '',
  ].join('\n');
  assert.deepEqual(show(doc), []);
});

test('markdown rules: code block content and front matter are ignored', () => {
  const fence = ['```text', '\ttab  ', '# not a heading', '* not a bullet', 'https://example.com', '', '', '```'];
  const doc = ['---', 'title: x  ', '\t# Bad', '* b', '---', '# Title', '', ...fence, '', '    * code\t  ', ''];
  assert.deepEqual(show(doc.join('\n')), []);
});

test('markdown rules: a byte-order mark, a comment opener and a one-line list', () => {
  for (const text of ['\uFEFF---\na: 1\n---\n# T\n', '# x\n<!-- a\nb -->\n']) assert.deepEqual(show(text), [], text);
  assert.deepEqual(show(`${T}text\n- a\n## H\n`), ['4 [MD032] Lists should be surrounded by blank lines', `5 [MD022] ${M022}Above]`]);
});
