import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { markdownWarnings } from '../markdown-rules.mjs';
import { postToolContext } from './hook-context.mjs';
import { hookFor, makeRepo, runClientHook, startRepo } from './support.mjs';

const show = (text) => markdownWarnings(text).map((w) => `${w.line} [${w.id}] ${w.message}`);
const COL = 'Table column style [Table pipe ';
const TABLE = '| a |\n| --- |\n';
const M022 = 'Headings should be surrounded by blank lines [Expected: 1; Actual: 0; ';
const M056 = 'Table column count [Expected: ';
const M055 = 'Table pipe style [Expected: leading_and_trailing; Actual: leading_only; Missing trailing pipe]';

// [label starting with the rule id, text, expected line, expected message]: that one warning and no other.
const CASES = [
  ['MD001', '# A\n\n#### B\n', 3, 'Heading levels should only increment by one level at a time [Expected: h2; Actual: h4]'],
  ['MD004 asterisk', '* a\n', 1, 'Unordered list style [Expected: dash; Actual: asterisk]'],
  ['MD004 plus', '+ a\n', 1, 'Unordered list style [Expected: dash; Actual: plus]'],
  ['MD007', '- a\n    - b\n', 2, 'Unordered list indentation [Expected: 2; Actual: 4]'],
  ['MD009', 'a   \n', 1, 'Trailing spaces [Expected: 0 or 2; Actual: 3]'],
  ['MD010', 'a\tb\tc\n', 1, 'Hard tabs [Column: 2]'],
  ['MD012', 'a\n\n\nb\n', 3, 'Multiple consecutive blank lines [Expected: 1; Actual: 2]'],
  ['MD012 phantom last line', 'a\n\n', 3, 'Multiple consecutive blank lines [Expected: 1; Actual: 2]'],
  ['MD022 above', 'a\n# H\n\nb\n', 2, `${M022}Above]`],
  ['MD022 below', '# H\ntext\n', 1, `${M022}Below]`],
  ['MD024', '# A\n\n## B\n\n## B\n', 5, 'Multiple headings with the same content'],
  ['MD025', '# A\n\n# B\n', 3, 'Multiple top-level headings in the same document'],
  ['MD026', '# A.\n', 1, "Trailing punctuation in heading [Punctuation: '.']"],
  ['MD029', '1. a\n2. b\n4. c\n', 3, 'Ordered list item prefix [Expected: 3; Actual: 4; Style: 1/2/3]'],
  ['MD031 opening fence', 'a\n```js\nx\n```\n', 2, 'Fenced code blocks should be surrounded by blank lines'],
  ['MD031 closing fence', '```js\nx\n```\nb\n', 3, 'Fenced code blocks should be surrounded by blank lines'],
  ['MD032 above', 'text\n- a\n', 2, 'Lists should be surrounded by blank lines'],
  ['MD032 below', '- a\n---\n', 1, 'Lists should be surrounded by blank lines'],
  ['MD034', 'see https://example.com now\n', 1, 'Bare URL used'],
  ['MD040', '```\nx\n```\n', 1, 'Fenced code blocks should have a language specified'],
  ['MD047', 'a', 1, 'Files should end with a single newline character'],
  ['MD055', '| a | b |\n| --- | --- |\n| 1 | 2\n', 3, M055],
  ['MD056 many', `${TABLE}| 1 | 2 |\n`, 3, `${M056}1; Actual: 2; Too many cells, extra data will be missing]`],
  ['MD056 few', '| a | b |\n| --- | --- |\n| 1 |\n', 3, `${M056}2; Actual: 1; Too few cells, row will be missing data]`],
  ['MD058 above', 'a\n| b |\n| --- |\n', 2, 'Tables should be surrounded by blank lines'],
  ['MD058 below', `${TABLE}---\n`, 2, 'Tables should be surrounded by blank lines'],
  ['MD060 missing right', `${TABLE}|b |\n`, 3, `${COL}is missing space to the right for style "compact"]`],
  ['MD060 extra right', `${TABLE}|  b |\n`, 3, `${COL}has extra space to the right for style "compact"]`],
  ['MD060 missing left', `${TABLE}| b|\n`, 3, `${COL}is missing space to the left for style "compact"]`],
  ['MD060 extra left', `${TABLE}| b  |\n`, 3, `${COL}has extra space to the left for style "compact"]`],
  ['MD060 delimiter', '| a |\n| ----- |\n', 2, 'Table column style [Delimiter cell should be --- for style "compact"]'],
  ['MD009 after front matter', '---\nx: 1\n---\na   \n', 4, 'Trailing spaces [Expected: 0 or 2; Actual: 3]'],
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
  for (const text of ['\uFEFF---\na: 1\n---\n# T\n', '## x\n<!-- a\nb -->\n']) assert.deepEqual(show(text), [], text);
  assert.deepEqual(show('text\n- a\n# H\n'), ['2 [MD032] Lists should be surrounded by blank lines', `3 [MD022] ${M022}Above]`]);
});

const HEAD = 'Markdown structure (10-documents.md): fix the listed warnings on the lines the change touched.';
const SPACES = 'Trailing spaces [Expected: 0 or 2; Actual: 3]';
const STAR = 'Unordered list style [Expected: dash; Actual: asterisk]';
const lint = (client, repo, toolInput, cwd = repo.dir) => postToolContext(runClientHook(client,
  hookFor(client, 'PostToolUse', 'check-markdown.mjs'), repo,
  { cwd, input: { cwd, hook_event_name: 'PostToolUse', tool_input: toolInput } }));

for (const client of ['claude', 'codex']) {
  test(`markdown check: ${client} reports only the lines an edit changed in a committed file`, (t) => {
    const repo = startRepo(t, { 'docs/x.md': '# A\n\n* old\n\ntext\n' });
    repo.git('config', 'diff.interHunkContext', '10');
    repo.write('docs/x.md', '# A   \n\n* old\n\ntext   \n\n');
    assert.equal(lint(client, repo, { file_path: 'docs/x.md' }), [HEAD, `docs/x.md:1 [MD009] ${SPACES}`, `docs/x.md:5 [MD009] ${SPACES}`,
      'docs/x.md:7 [MD012] Multiple consecutive blank lines [Expected: 1; Actual: 2]'].join('\n'));
  });

  test(`markdown check: ${client} reports every line of an untracked file`, (t) => {
    const repo = startRepo(t);
    repo.write('docs/new.md', 'a   \n\n* b\n');
    assert.equal(lint(client, repo, { file_path: 'docs/new.md' }),
      [HEAD, `docs/new.md:1 [MD009] ${SPACES}`, `docs/new.md:3 [MD004] ${STAR}`].join('\n'));
  });

  test(`markdown check: ${client} skips ignored, vendored, generated, external, non-Markdown and missing files`, (t) => {
    const repo = makeRepo(t);
    const external = makeRepo(t);
    external.write('x.md', '* a\n');
    repo.write('.gitattributes', 'vendor/** linguist-vendored\ngenerated/** linguist-generated\n');
    for (const file of ['.temp/x.md', 'vendor/x.md', 'generated/x.md', 'x.txt']) repo.write(file, '* a\n');
    for (const file of ['.temp/x.md', 'vendor/x.md', 'generated/x.md', join(external.dir, 'x.md'), 'x.txt', 'missing.md']) {
      assert.equal(lint(client, repo, { file_path: file }), '', file);
    }
  });
}

test('markdown check: an apply_patch input resolves its paths from a subdirectory', (t) => {
  const repo = makeRepo(t);
  repo.write('docs/x.md', '* a\n');
  const patch = '*** Begin Patch\n*** Update File: x.md\n*** End Patch';
  assert.equal(lint('codex', repo, { command: patch }, join(repo.dir, 'docs')), `${HEAD}\ndocs/x.md:1 [MD004] ${STAR}`);
});

test('markdown check: past 20 warnings the hook shows 20 and counts the rest', (t) => {
  const repo = makeRepo(t);
  repo.write('long.md', 'x   \n'.repeat(25));
  const lines = lint('claude', repo, { file_path: 'long.md' }).split('\n');
  assert.deepEqual(lines.slice(1, 21), Array.from({ length: 20 }, (_, i) => `long.md:${i + 1} [MD009] ${SPACES}`));
  assert.deepEqual(lines.slice(21),
    ['5 more warnings not shown; `node .scripts/check-markdown.mjs <file>` lists every warning in a file.']);
});

test('markdown check: the hook reports oversized files and skips binary ones', (t) => {
  const repo = makeRepo(t);
  repo.write('large.md', '* a\n' + 'a'.repeat(1024 * 1024));
  repo.write('binary.md', '\0* a\n');
  assert.equal(lint('claude', repo, { file_path: 'large.md' }), `${HEAD}\nlarge.md: not checked; size limit exceeded.`);
  assert.equal(lint('claude', repo, { file_path: 'binary.md' }), '');
});

test('markdown check: manual mode lints whole files and sets the exit status', (t) => {
  const repo = startRepo(t, { 'docs/x.md': '* old\n', 'docs/clean.md': '# A\n' });
  repo.write('docs/x.md', '* old\n\ntext   \n');
  const dirty = `docs/x.md:1 [MD004] ${STAR}\ndocs/x.md:3 [MD009] ${SPACES}\n`;
  for (const [args, status, stdout] of [[['docs/x.md'], 1, dirty], [['docs/clean.md'], 0, ''], [[], 2, ''],
    [['missing.md'], 2, ''], [['docs/x.md', 'missing.md'], 1, dirty]]) {
    const result = repo.script('check-markdown.mjs', args);
    const complains = args.length === 0 || args.includes('missing.md');
    assert.deepEqual([result.status, result.stdout, result.stderr !== ''], [status, stdout, complains], args.join(' '));
  }
});
