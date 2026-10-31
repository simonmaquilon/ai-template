import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownWarnings } from '../markdown-rules.mjs';

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
  'underscored words': 'a_'.repeat(MIB / 2),
  'comment openers beside a heading': `# h\n${'<!--'.repeat(MIB / 4)}`,
  'empty comments beside a heading': `# h\n${'<!---->'.repeat(MIB / 7)}`,
};

for (const [label, text] of Object.entries(HOSTILE)) {
  test(`markdown rules: ${label} of 1 MiB finish in under a second`, () => {
    const start = performance.now();
    markdownWarnings(text);
    assert.ok(performance.now() - start < 1000, label);
  });
}
