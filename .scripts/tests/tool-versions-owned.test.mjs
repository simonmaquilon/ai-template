import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { PROJECT_OWNED, TEMPLATE_ONLY, listed } from '../template-files.mjs';
import { TOOL_VERSIONS, fileProblems } from '../tool-versions-file.mjs';
import { ROOT } from './support.mjs';

const read = (file) => readFileSync(join(ROOT, file), 'utf8');

test('the tool versions file is the project\'s in a derived project, part of the template, and valid', () => {
  assert.ok(listed(PROJECT_OWNED, TOOL_VERSIONS), 'a derived project owns it, so the seal never restores it');
  assert.ok(!listed(TEMPLATE_ONLY, TOOL_VERSIONS), 'it is adopted');
  assert.ok(Object.hasOwn(JSON.parse(read('.agents/template-manifest.json')).files, TOOL_VERSIONS), 'the manifest records it');
  const data = JSON.parse(read(TOOL_VERSIONS));
  assert.deepEqual(fileProblems(data), []);
  assert.deepEqual(Object.keys(data), ['playwright', 'skills', 'typescript', 'typescript-language-server']);
});

test('a sandboxed command cannot write the file that the launchers outside the sandbox read', () => {
  const { denyWrite } = JSON.parse(read('.claude/settings.json')).sandbox.filesystem;
  assert.ok(denyWrite.includes(TOOL_VERSIONS), denyWrite.join(', '));
});

test('no version of the template tooling is written by hand outside the file and the generated block', () => {
  const versions = Object.values(JSON.parse(read(TOOL_VERSIONS))).map((entry) => entry.version);
  const stack = read('.docs/stack.md').replace(/<!-- stack:generated template-tooling -->[\s\S]*?<!-- \/stack:generated template-tooling -->/, '');
  for (const version of versions) assert.ok(!stack.includes(version), `${version} in .docs/stack.md outside its generated block`);
});
