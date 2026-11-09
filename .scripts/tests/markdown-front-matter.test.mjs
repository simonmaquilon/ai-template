import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { markdownWarnings } from '../markdown/rules.mjs';
import { makeRepo, run } from './support.mjs';

const show = (text) => markdownWarnings(text).map((w) => `${w.line} [${w.id}] ${w.message}`);

// Front matter forms markdownlint 0.41.1 accepts (its frontMatterRe) that the check must leave whole.
const FORMS = {
  'a --- delimiter with trailing whitespace': '--- \ntitle: x\ntags:\n    - a\n---\n# T\n',
  'a closing --- with trailing whitespace': '---\ntitle: x  \n---  \n# T\n',
  'TOML closed by three dots': '+++\ntitle = "x"   \n...\n# T\n',
  'TOML closed by +++ with trailing whitespace': '+++ \ntitle = "x"   \n+++\t\n# T\n',
  'JSON between braces': '{\n"title": "x"  \n}\n# T\n',
  'blank lines after the closing delimiter': '---\ntitle: x\n---\n\n\n# T\n',
};

for (const [label, text] of Object.entries(FORMS)) {
  test(`markdown rules: front matter with ${label} is skipped`, () => {
    assert.deepEqual(show(text), []);
  });
}

test('markdown fix: never changes a byte of front matter of the forms markdownlint accepts', (t) => {
  const repo = makeRepo(t);
  const names = Object.keys(FORMS).map((_, i) => `f${i}.md`);
  Object.values(FORMS).forEach((text, i) => repo.write(names[i], text));
  const result = run(process.execPath, [join(repo.dir, '.scripts', 'check-markdown.mjs'), '--fix', ...names], { cwd: repo.dir });
  assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', '']);
  names.forEach((name, i) => assert.equal(readFileSync(join(repo.dir, name), 'utf8'), Object.values(FORMS)[i], name));
});
