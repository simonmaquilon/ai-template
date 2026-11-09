import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { markdownWarnings } from '../markdown/rules.mjs';
import { makeRepo, run } from './support.mjs';

const ids = (text) => markdownWarnings(text).map((w) => `${w.line} ${w.id}`);
const T = '# T\n\n';

// [label, text, warnings]: HTML blocks of CommonMark types 1 to 5 end at their own end condition, never at a blank line.
const CASES = [
  ['pre', `${T}<pre>\n* a\n\n* b   \n</pre>\n`, ['6 MD009']],
  ['pre in another case', `${T}<PRE>\n* a\n\n* b   \n</Pre>\n`, ['6 MD009']],
  ['pre inside a list item', `${T}- a\n\n  <pre>\n  * x\n\n  * y   \n  </pre>\n`, ['8 MD009']],
  ['script, then a list after its closing tag', `${T}<script>\n* a\n\n* b   \n</script>\n\n* c   \n`, ['6 MD009', '9 MD004', '9 MD009']],
  ['style with text after its closing tag', `${T}<style>x\n\n* b   \n</style> tail\n\n* c   \n`, ['5 MD009', '8 MD004', '8 MD009']],
  ['textarea without a closing tag', `${T}<textarea>\n\n* b   \n`, ['5 MD009']],
  ['processing instruction', `${T}<?php\n* a\n\n* b   \n?>\n\n* c   \n`, ['6 MD009', '9 MD004', '9 MD009']],
  ['declaration', `${T}<!DOCTYPE html\n* a\n\n* b   \n>\n`, ['6 MD009']],
  ['CDATA section', `${T}<![CDATA[\n* a\n\n* b   \n]]>\n`, ['6 MD009']],
  ['comment with a blank line and trailing spaces and tabs', `${T}<!--\n* a  \n\n\t* b   \n-->\n`, []],
  ['block that closes on its first line', `${T}<pre>one</pre>\n\n* c   \n`, ['5 MD004', '5 MD009']],
  ['a list after a one-line declaration', `${T}<!DOCTYPE html>\n* b   \n\n* c\n`, ['4 MD004', '4 MD009', '4 MD032', '6 MD004']],
];

for (const [label, text, expected] of CASES) {
  test(`markdown rules: HTML block of ${label}`, () => {
    assert.deepEqual(ids(text), expected);
  });
}

test('markdown fix: never changes the content of an HTML block of types 1 to 5', (t) => {
  const repo = makeRepo(t);
  const inputs = [`${T}<pre>\n* a\n\n* b\n</pre>\n`, `${T}<script>\n* a\n\n* b\n</script>\n`, `${T}<!--\n* a\n\n\t* b   \n-->\n`,
    `${T}<?php\n* a\n\n* b\n?>\n`, `${T}<![CDATA[\n* a\n\n* b\n]]>\n`, `${T}<!DOCTYPE html\n* a\n\n* b\n>\n`];
  inputs.forEach((text, i) => repo.write(`h${i}.md`, text));
  const names = inputs.map((_, i) => `h${i}.md`);
  const result = run(process.execPath, [join(repo.dir, '.scripts', 'check-markdown.mjs'), '--fix', ...names], { cwd: repo.dir });
  assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', '']);
  names.forEach((name, i) => assert.equal(readFileSync(join(repo.dir, name), 'utf8'), inputs[i], name));
});
