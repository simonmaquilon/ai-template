import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownWarnings } from '../markdown/rules.mjs';

const MIB = 2 ** 20;
// Single-line inputs that made the engine quadratic in the line length.
const HOSTILE = {
  'open brackets': '['.repeat(MIB),
  'heading spaces': `# a${' '.repeat(MIB)}b`,
  'open tags': '<'.repeat(MIB),
  'open links': '[a]('.repeat(MIB / 4),
  'backtick run': `x ${'`'.repeat(MIB)}a`,
  'delimiter spaces': `| a |\n|-${' '.repeat(MIB)}x`,
  'heading punctuation': `# a${'!'.repeat(MIB)}b`,
  underscores: `x ${'_'.repeat(MIB)}a`,
  'heading underscores': `# x ${'_'.repeat(MIB)} \n`,
  'heading underscores before text': `# x ${'_'.repeat(MIB)}-\n`,
  'heading underscore runs': `# ${'_ '.repeat(MIB / 2)}\n`,
  'underscored words': 'a_'.repeat(MIB / 2),
  'comment openers beside a heading': `# h\n${'<!--'.repeat(MIB / 4)}`,
  'empty comments beside a heading': `# h\n${'<!---->'.repeat(MIB / 7)}`,
  'heading images': `# ${'![a]('.repeat(MIB / 5)}`,
  'heading openers': `# ${'[a'.repeat(MIB / 2)}`,
  'heading code spans': `# ${'`a` '.repeat(MIB / 4)}`,
  'link fragments': '[a](#x'.repeat(MIB / 6),
  'definition fragments': '[a]: #x\n'.repeat(MIB / 8),
  'html tags': '<a id=x>'.repeat(MIB / 8),
};

for (const [label, text] of Object.entries(HOSTILE)) {
  test(`markdown rules: ${label} of 1 MiB finish in under a second`, () => {
    const start = performance.now();
    markdownWarnings(text);
    assert.ok(performance.now() - start < 1000, label);
  });
}

test('markdown rules: 16000 headings and 16000 unknown links finish in under a second', () => {
  const headings = Array.from({ length: 16000 }, (_, i) => `## h${i}\n\n`).join('');
  const links = Array.from({ length: 16000 }, (_, i) => `[a](#nope${i})\n`).join('');
  const start = performance.now();
  markdownWarnings(`# T\n\n${headings}${links}`);
  assert.ok(performance.now() - start < 1000);
});
