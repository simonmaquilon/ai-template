import assert from 'node:assert/strict';
import test from 'node:test';
import { readBlocks } from '../markdown/blocks.mjs';
import { markdownWarnings } from '../markdown/rules.mjs';

const H = '# T\n\n';
const TABLE = '| a |\n| --- |\n';
const REPORT = { op: 'report' };
const edit = (at, remove, insert) => ({ op: 'edit', at, remove, insert });
const blank = (where, line, prefix = '') => ({ op: 'blank', where, line, prefix });
const found = (text, id) => markdownWarnings(text).filter((w) => w.id === id);

// [rule id, text, line, fix]: the fix of the one warning of that rule the text has.
const FIXES = [
  ['MD004', `${H}* a\n`, 3, edit(0, 1, '-')],
  ['MD004', `${H}+ a\n`, 3, edit(0, 1, '-')],
  ['MD004', `${H}> * a\n`, 3, edit(2, 1, '-')],
  ['MD007', `${H}- a\n    - b\n`, 4, edit(0, 4, '  ')],
  ['MD009', `${H}a   \n`, 3, edit(1, 3, '')],
  ['MD012', `${H}a\n\n\nb\n`, 5, { op: 'delete-line' }],
  ['MD022', `${H}a\n## H\n\nb\n`, 4, blank('before', 4)],
  ['MD022', `${H}## H\ntext\n`, 3, blank('after', 3)],
  ['MD022', `${H}Sub\n---\ntext\n`, 3, blank('after', 4)],
  ['MD022', `${H}> a\n> ## H\n>\n> b\n`, 4, blank('before', 4, '>')],
  ['MD031', `${H}a\n\`\`\`js\nx\n\`\`\`\n`, 4, blank('before', 4)],
  ['MD031', `${H}\`\`\`js\nx\n\`\`\`\nb\n`, 5, blank('after', 5)],
  ['MD032', `${H}text\n- a\n`, 4, blank('before', 4)],
  ['MD032', `${H}- a\n- b\n---\n`, 4, blank('after', 4)],
  ['MD040', `${H}\`\`\`\nx\n\`\`\`\n`, 3, edit(3, 0, 'text')],
  ['MD040', `${H}- a\n\n  ~~~\n  x\n  ~~~\n`, 5, edit(5, 0, 'text')],
  ['MD047', `${H}a`, 3, { op: 'final-newline' }],
  ['MD058', `${H}a\n| b |\n| --- |\n`, 4, blank('before', 4)],
  ['MD058', `${H}${TABLE}---\n`, 4, blank('after', 4)],
  ['MD060', `${H}${TABLE}|b |\n`, 5, edit(0, 4, '| b |')],
  ['MD060', `${H}${TABLE}|  b  |\n`, 5, edit(0, 7, '| b |')],
  ['MD060', `${H}| a |\n| ----- |\n`, 4, edit(0, 9, '| --- |')],
  ['MD060', `${H}| a | b |\n|:---:|---:|\n`, 4, edit(0, 12, '| :---: | ---: |')],
  ['MD060', `${H}| a | b |\n| --- | --- |\n|  | x|\n`, 5, edit(0, 7, '| | x |')],
  ['MD060', `${H}a | b\n--- | ---\nc|d\n`, 5, edit(0, 3, 'c | d')],
  ['MD060', `${H}> | a |\n> | --- |\n> |b |\n`, 5, edit(2, 4, '| b |')],
];

// Texts whose warning has no correction the engine knows.
const REPORT_ONLY = [
  ['MD001', '# A\n\n#### B\n'], ['MD010', `${H}a\tb\n`], ['MD024', `${H}## B\n\n## B\n`], ['MD025', `${H}# B\n`],
  ['MD026', `${H}## B.\n`], ['MD029', `${H}1. a\n2. b\n4. c\n`], ['MD034', `${H}see https://example.com now\n`],
  ['MD041', 'text\n'], ['MD051', `${H}[a](#gone)\n`], ['MD055', `${H}| a | b |\n| --- | --- |\n| 1 | 2\n`],
  ['MD056', `${H}| a |\n| --- |\n| 1 | 2 |\n`],
  ['MD060', `${H}${TABLE}|\`a\` |\n`], ['MD060', `${H}${TABLE}| a\\|b  |\n`],
];

// Applies one fix to LF text the way a later --fix would.
function apply(text, { line, fix }) {
  const lines = text.split('\n');
  if (fix.op === 'edit') lines[line - 1] = lines[line - 1].slice(0, fix.at) + fix.insert + lines[line - 1].slice(fix.at + fix.remove);
  if (fix.op === 'delete-line') lines.splice(line - 1, 1);
  if (fix.op === 'blank') lines.splice(fix.where === 'before' ? fix.line - 1 : fix.line, 0, fix.prefix);
  if (fix.op === 'final-newline') lines.push('');
  return lines.join('\n');
}

for (const [id, text, line, fix] of FIXES) {
  test(`markdown rules: ${id} warning carries its fix ${JSON.stringify(text.slice(H.length))}`, () => {
    const [warning, ...others] = found(text, id);
    assert.deepEqual([others, warning.line, warning.fix], [[], line, fix]);
    assert.deepEqual(found(apply(text, warning), id), [], 'applying the fix clears the warning');
  });
}

for (const [id, text] of REPORT_ONLY) {
  test(`markdown rules: ${id} warning is report-only ${JSON.stringify(text.slice(H.length))}`, () => {
    assert.deepEqual(found(text, id).map((w) => w.fix), [REPORT]);
  });
}

test('markdown rules: every warning carries a fix with an operation', () => {
  const doc = `a   \n\n\n* b\n    - c\n#### D\n\`\`\`\nx\n\`\`\`\n| a |\n|b |\n`;
  const warnings = markdownWarnings(doc);
  assert.ok(warnings.length >= 10);
  for (const w of warnings) assert.equal(typeof w.fix?.op, 'string', `${w.id} line ${w.line}`);
});

test('markdown blocks: each line exposes its blockquote prefix', () => {
  assert.deepEqual(readBlocks('---\na: 1\n---\n> a\n> > b\n  > c\nd\n').quotes,
    ['', '', '', '> ', '> > ', '  > ', '', '']);
});
