// Markdown style rules over the blocks that blocks.mjs reads. A pure function of the text: it never reads files
// or the environment. It backs the edit hook and manual check of check-markdown.mjs (rule 10-documents.md). Ids and
// messages follow markdownlint 0.41.1, which the editor extension runs with the rules and options that
// .markdownlint-cli2.jsonc selects. Each warning carries a `fix` (see fixes.mjs): how to correct it, or that
// only a person can.

import { readBlocks } from './blocks.mjs';
import { DELETE_LINE, FINAL_NEWLINE, REPORT, fixesFor } from './fixes.mjs';
import { firstHeadingWarning, fragmentWarnings } from './headings.mjs';
import { hasBare } from './inline.mjs';
import { tableWarnings } from './tables.mjs';

const around = (what) => `${what} should be surrounded by blank lines`;
const byLine = (a, b) => a.line - b.line || a.id.localeCompare(b.id);

// markdownlint's isBlankLine in linear time: comments, text up to a stray "-->" and any ">" leave nothing but whitespace.
function isBlank(line = '') {
  let kept = '', at = 0, open = line.indexOf('<!--'), end = line.indexOf('-->');
  while (open >= 0 || end >= 0) {
    if (end < 0 || (open >= 0 && open <= end)) kept += line.slice(at, open);
    at = end < 0 ? line.length : end + 3;
    if (open >= 0 && open < at) open = line.indexOf('<!--', at);
    if (end >= 0 && end < at) end = line.indexOf('-->', at);
  }
  return !(kept + line.slice(at)).replace(/>/g, '').trim();
}

export function markdownWarnings(text) {
  const blocks = readBlocks(text);
  const { lines, kinds, texts, headings, items, lists, fences } = blocks;
  const fix = fixesFor(blocks);
  const found = [];
  const add = (index, id, message, correction = REPORT) => found.push({ line: index + 1, id, message, fix: correction });
  const gap = (index) => kinds[index] === undefined || kinds[index] === 'skip' || isBlank(lines[index]);

  let blanks = 0;
  lines.forEach((line, i) => {
    if (kinds[i] === 'skip' || kinds[i] === 'code') {
      blanks = 0;
      return;
    }
    // The content of a comment is not text to markdownlint: only what follows its closing mark is.
    const text = kinds[i] === 'comment' ? (line.includes('-->') ? line.slice(line.lastIndexOf('-->') + 3) : '') : line;
    const spaces = text.length - text.trimEnd().length;
    if (spaces && spaces !== 2) {
      add(i, 'MD009', `Trailing spaces [Expected: 0 or 2; Actual: ${spaces}]`, fix.trailing(i, spaces));
    }
    if (text.includes('\t')) add(i, 'MD010', `Hard tabs [Column: ${line.length - text.length + text.indexOf('\t') + 1}]`);
    blanks = line.trim() ? 0 : blanks + 1;
    if (blanks > 1) add(i, 'MD012', `Multiple consecutive blank lines [Expected: 1; Actual: ${blanks}]`, DELETE_LINE);
    if (['para', 'item', 'heading', 'table'].includes(kinds[i]) && hasBare(texts[i])) add(i, 'MD034', 'Bare URL used');
  });
  if (kinds.at(-1) !== 'skip' && lines.at(-1).trim()) {
    add(lines.length - 1, 'MD047', 'Files should end with a single newline character', FINAL_NEWLINE);
  }

  const lead = kinds.findIndex((k) => !['skip', 'blank', 'comment'].includes(k));
  const titled = headings.find((h) => h.start === lead)?.level === 1;
  firstHeadingWarning(blocks, lead, add);
  fragmentWarnings(blocks, add);
  const seen = new Set();
  headings.forEach((h, n) => {
    const level = headings[n - 1]?.level ?? h.level;
    const closing = /(?<![.,;:!。，；：！])[.,;:!。，；：！]+$/.exec(h.text);
    if (h.level > level + 1) {
      const detail = `[Expected: h${level + 1}; Actual: h${h.level}]`;
      add(h.start, 'MD001', `Heading levels should only increment by one level at a time ${detail}`);
    }
    if (!gap(h.start - 1)) {
      add(h.start, 'MD022', `${around('Headings')} [Expected: 1; Actual: 0; Above]`, fix.blank('before', h.start));
    }
    if (!gap(h.end + 1)) {
      add(h.start, 'MD022', `${around('Headings')} [Expected: 1; Actual: 0; Below]`, fix.blank('after', h.end));
    }
    if (seen.has(h.text)) add(h.start, 'MD024', 'Multiple headings with the same content');
    if (titled && h.level === 1 && h.start !== lead) add(h.start, 'MD025', 'Multiple top-level headings in the same document');
    if (closing && !/&#?\w+;$|:[\w+-]+:$/.test(h.text)) {
      add(h.start, 'MD026', `Trailing punctuation in heading [Punctuation: '${closing[0]}']`);
    }
    seen.add(h.text);
  });

  // The MD007 fix moves a bullet only to a column that is not before the content column its parent has once it moves.
  const wrong = (it) => it.pure && it.mcol !== it.depth * 2;
  const movable = (it) => wrong(it) && (!it.parent || it.depth * 2 >= after(it.parent));
  const after = (it) => it.col + (movable(it) ? it.depth * 2 - it.mcol : 0);
  for (const item of items.filter((it) => !it.ordered)) {
    const style = item.key === '*' ? 'asterisk' : 'plus';
    if (item.key !== '-') {
      add(item.line, 'MD004', `Unordered list style [Expected: dash; Actual: ${style}]`, fix.bullet(item.line));
    }
    if (wrong(item)) {
      const message = `Unordered list indentation [Expected: ${item.depth * 2}; Actual: ${item.mcol}]`;
      add(item.line, 'MD007', message, movable(item) ? fix.indent(item.line, item.depth * 2) : REPORT);
    }
  }
  for (const list of lists) {
    list.items.forEach((it, n) => {
      if (list.ordered && it.num !== n + 1) {
        add(it.line, 'MD029', `Ordered list item prefix [Expected: ${n + 1}; Actual: ${it.num}; Style: 1/2/3]`);
      }
    });
    if (list.depth > 0) continue;
    if (!gap(list.start - 1)) add(list.start, 'MD032', around('Lists'), fix.blank('before', list.start));
    if (!gap(list.end + 1) && (list.end > list.start || gap(list.start - 1))) {
      add(list.end, 'MD032', around('Lists'), fix.blank('after', list.end));
    }
  }
  for (const fence of fences) {
    const what = around('Fenced code blocks');
    if (!gap(fence.open - 1)) add(fence.open, 'MD031', what, fix.blank('before', fence.open));
    if (fence.close >= 0 && !gap(fence.close) && !gap(fence.close + 1)) {
      add(fence.close, 'MD031', what, fence.unclosed ? REPORT : fix.blank('after', fence.close));
    }
    if (!fence.info) add(fence.open, 'MD040', 'Fenced code blocks should have a language specified', fix.language(fence));
  }

  tableWarnings(blocks, gap, add, fix);
  return found.sort(byLine);
}
