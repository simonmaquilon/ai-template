import assert from 'node:assert/strict';
import test from 'node:test';
import { answer, index, planRepo } from './plan-stop-fixture.mjs';
import { openLine, openLines } from '../plan-stop-questions.mjs';

const open = (line) => openLine(line);

test('openLine finds a pending mark in a list line, a quote, a task box, emphasis, and a table cell', () => {
  const forms = {
    'list': ['⏳ Commit waits', true], '- list': ['- ⚠️ AC2 not measured', false], 'numbered': ['1. ⏳ Run it', true],
    'quote': ['> ⏳ Commit waits', true], 'quoted list': ['> - ⚠ AC2 not measured', false], 'nested quote': ['> > ⏳ Commit waits', true],
    'open task': ['- [ ] ⏳ Commit waits', true], 'done task': ['- [x] ⚠️ AC2 not measured', false],
    'bold mark': ['**⏳** Commit waits', true], 'bold line': ['- **⚠️ AC2 not measured**', false], 'italic mark': ['*⏳* Commit waits', true],
    'cell': ['| C1 | ⏳ | text |', true], 'first cell': ['| ⚠️ | C1 | text |', false], 'bold cell': ['| C1 | **⏳** | text |', true],
    'quoted row': ['> | C1 | ⚠ | text |', false], 'indented row': ['  | C1 | ⏳ | text |', true],
  };
  for (const [name, [line, pending]] of Object.entries(forms)) assert.deepEqual(open(line), { id: undefined, pending }, name);
});

test('openLine reads the identifier after the mark, and anywhere in a table row', () => {
  assert.equal(open('- ⏳ [P-01] Commit waits').id, 'P-01');
  assert.equal(open('**⏳** [P-02] Commit waits').id, 'P-02');
  assert.equal(open('> ⚠️ [partial] [P-03] Partial').id, 'P-03');
  assert.equal(open('- [ ] ⏳ [P-04] Commit waits').id, 'P-04');
  assert.equal(open('| C1 | ⏳ | [P-05] text |').id, 'P-05');
  assert.equal(open('| [P-06] | C1 | **⚠️** | text |').id, 'P-06');
  assert.equal(open('- ⏳ Commit waits on [P-07]').id, undefined);
});

test('openLine skips a line that only mentions a mark, a table separator, and a table without a marked cell', () => {
  for (const line of ['✅ AC1 met, the ⏳ before was resolved', '- ✅ AC1 met after ⚠️ AC2', '> ℹ️ note about ⏳', '', 'Plain ⏳ text', '| --- | :---: | ---: |',
    '| C1 | ✅ | cleared the ⏳ |', '| C1 | done ⚠️ | text |', '- [x] ✅ AC1 met', '-⏳ no space after the bullet']) {
    assert.equal(open(line), null, line);
  }
});

test('openLines skips fenced code, keeps the line number of the rest, and does not close a fence with a shorter one', () => {
  const text = ['⏳ one', '```md', '⏳ in a fence', '| C1 | ⏳ |', '```', '⚠️ two', '~~~~', '- ⏳ in a tilde fence', '~~~', '⏳ still in it', '~~~~', '> ```', '> ⏳ quoted fence', '> ```', '- [ ] ⏳ three'].join('\n');
  assert.deepEqual(openLines(text).map(({ at, line }) => [at, line]), [[0, '⏳ one'], [5, '⚠️ two'], [14, '- [ ] ⏳ three']]);
});

for (const client of ['claude', 'codex']) {
  test(`${client}: the hook blocks on a pending mark in each markdown form and ignores fenced ones`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    const report = ['✅ AC1 met, after the ⏳ was cleared', '```', '⏳ inside a fence', '```', '> ⏳ quoted', '- [ ] ⚠️ task', '**⏳** bold', '| C1 | ⏳ | table |', '| --- | --- | --- |'].join('\n');
    fixture.plan({ 'build/00-index.md': index('done'), 'review/report.md': `${report}\n` });
    const { reason } = answer(assert, fixture.fire('Stop', { stop_hook_active: false }));
    for (const at of [5, 6, 7, 8]) assert.match(reason, new RegExp(`report\\.md:${at}: `));
    for (const at of [1, 3, 9]) assert.doesNotMatch(reason, new RegExp(`report\\.md:${at}: `));
  });
}

test('openLine opens a not-verified line and cell as an open line that is not pending, and not a mark in mid-text', () => {
  const forms = {
    'plain': '🚫 AC2 not measured, no browser', 'list': '- 🚫 AC2 not measured, no browser', 'quote': '> 🚫 AC2 not measured, no browser',
    'task': '- [ ] 🚫 AC2 not measured', 'bold': '- **🚫 AC2 not measured**', 'cell': '| C1 | 🚫 | text |', 'first cell': '| 🚫 | C1 | text |',
  };
  for (const [name, line] of Object.entries(forms)) assert.deepEqual(open(line), { id: undefined, pending: false }, name);
  assert.equal(open('- 🚫 [P-08] AC2 not measured').id, 'P-08');
  assert.equal(open('| [P-09] | C1 | **🚫** | text |').id, 'P-09');
  for (const line of ['✅ AC1 met, the 🚫 before was resolved', '- ✅ AC1 met after 🚫 AC2', '> ℹ️ note about 🚫', 'Plain 🚫 text', '| C1 | done 🚫 | text |', '-🚫 no space after the bullet']) {
    assert.equal(open(line), null, line);
  }
});

test('openLines skips a not-verified mark inside fenced code and keeps the other marks', () => {
  const text = ['🚫 one', '```md', '🚫 in a fence', '| C1 | 🚫 |', '```', '⏳ two', '⚠ three', '| C1 | 🚫 | four |'].join('\n');
  assert.deepEqual(openLines(text).map(({ at, pending }) => [at, pending]), [[0, false], [5, true], [6, false], [7, false]]);
});

for (const client of ['claude', 'codex']) {
  test(`${client}: the hook blocks on a not-verified line and cell, and never cuts a surrogate pair of a long line`, (t) => {
    const fixture = planRepo(t, client);
    fixture.turn();
    const long = `⚠️ ${'a'.repeat(195)}🚫 tail of a long line`;
    fixture.plan({ 'build/00-index.md': index('done'), 'review/report.md': `✅ met\n- 🚫 AC2 not measured, no browser\n| C1 | 🚫 | table |\n${long}\n✅ cleared the 🚫 before\n` });
    const { reason } = answer(assert, fixture.fire('Stop', { stop_hook_active: false }));
    for (const at of [2, 3]) assert.match(reason, new RegExp(`report\\.md:${at}: `));
    for (const at of [1, 5]) assert.doesNotMatch(reason, new RegExp(`report\\.md:${at}: `));
    assert.doesNotMatch(reason, /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/);
    assert.match(reason, /report\.md:4: ⚠️ a+🚫…/);
  });
}
