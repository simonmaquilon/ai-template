import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, stack, table, tools } from './run-pinned-fixture.mjs';

test('run-pinned refuses invalid input without running anything', (t) => {
  const valid = stack([['skills', '9.0.1']]);
  const file = tools([['skills', '9.0.3']]);
  const fenced = '# Technology Stack\n\n```md\n## Project Tooling\n\n' + table([['skills', '6.6.6']]) + '```\n\n' + valid.slice(19);
  const entry = JSON.parse(file).skills;
  const bad = (change) => JSON.stringify({ skills: { ...entry, ...change } });
  const cases = [
    ['missing .docs/stack.md', undefined, ['skills'], /\.docs\/stack\.md is missing/],
    ['missing section', '# Technology Stack\n\n## Template Tooling\n\ngenerated\n', ['skills'], /no "Project Tooling" section/],
    ['repeated section', fenced, ['skills'], /more than one "Project Tooling" section/],
    ['malformed header', valid.replace('| Verification |', ''), ['skills'], /Project Tooling table of \.docs\/stack\.md is malformed/],
    ['malformed separator', valid.replace('| --- | --- | --- | --- | --- |', '| --- | --- |'), ['skills'], /table of \.docs\/stack\.md is malformed/],
    ['malformed row', valid.replace('| MIT | origin | checked |', '| MIT | origin |'), ['skills'], /malformed row/],
    ['malformed project table', stack([['bad name', '1.0.0']]), ['skills'], /Project Tooling table of \.docs\/stack\.md has a malformed row/],
    ['unlisted package', valid, ['unknown-tool'], /unknown-tool is not listed in \.agents\/tool-versions\.json or the Project Tooling table/],
    ['package twice in Project Tooling', stack([['skills', '9.0.1'], ['skills', '9.0.4']]), ['skills'], /skills is listed more than once/],
    ['unlisted package to install', valid, ['--install', 'skills', 'unknown-tool'], /unknown-tool is not listed/],
    ['nothing to install', valid, ['--install'], /usage:/],
    ['no package', valid, [], /usage:/],
    ['file that is not JSON', undefined, ['skills'], /tool-versions\.json is not valid JSON/, '{ not json'],
    ['file that is not an object', undefined, ['skills'], /is not a JSON object/, '[]'],
    ['entry with a range', undefined, ['skills'], /invalid for skills \(version is not an exact X\.Y\.Z version\).*--check/, bad({ version: '^9.0.1' })],
    ['entry without integrity', undefined, ['skills'], /invalid for skills \(integrity is missing\)/, bad({ integrity: undefined })],
    ['entry with an unknown field', undefined, ['skills'], /unknown field "extra"/, bad({ extra: 1 })],
  ];
  for (const version of ['^9.0.1', 'latest', '9.0', '9.0.1-beta.1', '09.0.1']) {
    cases.push([`version ${version}`, stack([['skills', version]]), ['skills'], /skills has no exact version/]);
  }
  for (const [name, text, args, message, content] of cases) {
    const result = fixture(t, text, content)(args);
    assert.equal(result.status, 1, name);
    assert.equal(result.stdout, '', name);
    assert.match(result.stderr, /^run-pinned: /, name);
    assert.match(result.stderr, message, name);
  }
});
