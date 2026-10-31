// Markdown style rules over the blocks markdown-blocks.mjs reads. A pure function of the text: it never reads files
// or the environment. It backs the edit hook and manual check of check-markdown.mjs (rule 10-documents.md); ids and
// messages follow markdownlint, so they match the editor extension.

import { PIPE, cells, readBlocks } from './markdown-blocks.mjs';

// Link and image pattern that cannot contain its own opener, so no scan restarts from every opener; repeated, it strips
// nested ones innermost first.
const LINK = /!?\[[^[\]]*\](?:\([^()]*\)|\[[^[\]]*\])|!\[[^[\]]*\]/g;
const STRIP = [/^[^[]*\]\([^()]*\)/, LINK, LINK, LINK, /<[^<>]*>/g];
const BARE = /(?<![^\s*_~(])(?:https?:\/\/|www\.)\S+|(?<![^\s*~(])[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z][\w-]*/i;
const PIPE_STYLES = ['no_leading_or_trailing', 'trailing_only', 'leading_only', 'leading_and_trailing'];
const COMPACT = 'for style "compact"';

const around = (what) => `${what} should be surrounded by blank lines`;
const pipeStyle = (row) => (row.startsWith('|') ? 2 : 0) + (/(?<!\\)\|$/.test(row) ? 1 : 0);
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

// Blanks the code spans, which a backtick run closes with the next run of the same length, in linear time.
function stripCode(text) {
  const parts = text.split(/(`+)/), later = new Map(), closer = [];
  for (let i = parts.length - 2; i > 0; i -= 2) {
    closer[i] = later.get(parts[i].length);
    later.set(parts[i].length, i);
  }
  let out = parts[0];
  for (let i = 1; i < parts.length; i += 2) out += closer[i] === undefined ? parts[i] + parts[i + 1] : ` ${parts[(i = closer[i]) + 1]}`;
  return out;
}

const hasBare = (text) => !/^\[[^\]]+\]:/.test(text) && BARE.test(STRIP.reduce((t, re) => t.replace(re, ' '), stripCode(text)));

// First compact-style problem (MD060) of a table row, or ''.
function compactProblem(row, delimiter) {
  const parts = row.split(PIPE), last = parts.length - 1;
  const space = (n, side) => (n === 1 ? '' : `Table pipe ${n ? 'has extra' : 'is missing'} space to the ${side} ${COMPACT}`);
  for (let j = row.startsWith('|') ? 1 : 0; j <= (parts[last] === '' ? last - 1 : last); j++) {
    const cell = parts[j];
    const lead = cell.length - cell.trimStart().length, trail = cell.length - cell.trimEnd().length;
    const spacing = cell.trim()
      ? (j > 0 && space(lead, 'right')) || (j < last && space(trail, 'left'))
      : j > 0 && j < last && space(cell.length, 'right');
    const content = delimiter && !/^:?---:?$/.test(cell.trim()) ? `Delimiter cell should be --- ${COMPACT}` : '';
    if (spacing || content) return spacing || content;
  }
  return '';
}

export function markdownWarnings(text) {
  const { lines, kinds, texts, headings, items, lists, fences, tables } = readBlocks(text);
  const found = [];
  const add = (index, id, message) => found.push({ line: index + 1, id, message });
  const gap = (index) => kinds[index] === undefined || kinds[index] === 'skip' || isBlank(lines[index]);

  let blanks = 0;
  lines.forEach((line, i) => {
    if (kinds[i] === 'skip' || kinds[i] === 'code') {
      blanks = 0;
      return;
    }
    const spaces = line.length - line.trimEnd().length;
    if (spaces && spaces !== 2) add(i, 'MD009', `Trailing spaces [Expected: 0 or 2; Actual: ${spaces}]`);
    if (line.includes('\t')) add(i, 'MD010', `Hard tabs [Column: ${line.indexOf('\t') + 1}]`);
    blanks = line.trim() ? 0 : blanks + 1;
    if (blanks > 1) add(i, 'MD012', `Multiple consecutive blank lines [Expected: 1; Actual: ${blanks}]`);
    if (['para', 'item', 'heading', 'table'].includes(kinds[i]) && hasBare(texts[i])) add(i, 'MD034', 'Bare URL used');
  });
  if (kinds.at(-1) !== 'skip' && lines.at(-1).trim()) add(lines.length - 1, 'MD047', 'Files should end with a single newline character');

  const lead = kinds.findIndex((k) => !['skip', 'blank', 'comment'].includes(k));
  const titled = headings.find((h) => h.start === lead)?.level === 1;
  const seen = new Set();
  headings.forEach((h, n) => {
    const level = headings[n - 1]?.level ?? h.level;
    const closing = /(?<![.,;:!。，；：！])[.,;:!。，；：！]+$/.exec(h.text);
    if (h.level > level + 1) {
      const detail = `[Expected: h${level + 1}; Actual: h${h.level}]`;
      add(h.start, 'MD001', `Heading levels should only increment by one level at a time ${detail}`);
    }
    if (!gap(h.start - 1)) add(h.start, 'MD022', `${around('Headings')} [Expected: 1; Actual: 0; Above]`);
    if (!gap(h.end + 1)) add(h.start, 'MD022', `${around('Headings')} [Expected: 1; Actual: 0; Below]`);
    if (seen.has(h.text)) add(h.start, 'MD024', 'Multiple headings with the same content');
    if (titled && h.level === 1 && h.start !== lead) add(h.start, 'MD025', 'Multiple top-level headings in the same document');
    if (closing && !/&#?\w+;$|:[\w+-]+:$/.test(h.text)) {
      add(h.start, 'MD026', `Trailing punctuation in heading [Punctuation: '${closing[0]}']`);
    }
    seen.add(h.text);
  });

  for (const item of items.filter((it) => !it.ordered)) {
    const style = item.key === '*' ? 'asterisk' : 'plus';
    if (item.key !== '-') add(item.line, 'MD004', `Unordered list style [Expected: dash; Actual: ${style}]`);
    if (item.pure && item.mcol !== item.depth * 2) {
      add(item.line, 'MD007', `Unordered list indentation [Expected: ${item.depth * 2}; Actual: ${item.mcol}]`);
    }
  }
  for (const list of lists) {
    list.items.forEach((it, n) => {
      if (list.ordered && it.num !== n + 1) {
        add(it.line, 'MD029', `Ordered list item prefix [Expected: ${n + 1}; Actual: ${it.num}; Style: 1/2/3]`);
      }
    });
    if (list.depth > 0) continue;
    if (!gap(list.start - 1)) add(list.start, 'MD032', around('Lists'));
    if (!gap(list.end + 1) && (list.end > list.start || gap(list.start - 1))) add(list.end, 'MD032', around('Lists'));
  }
  for (const fence of fences) {
    if (!gap(fence.open - 1)) add(fence.open, 'MD031', around('Fenced code blocks'));
    if (fence.close >= 0 && !gap(fence.close + 1)) add(fence.close, 'MD031', around('Fenced code blocks'));
    if (!fence.info) add(fence.open, 'MD040', 'Fenced code blocks should have a language specified');
  }

  let expected;
  for (const { rows } of tables) {
    const columns = cells(texts[rows[0]]).length;
    if (!gap(rows[0] - 1)) add(rows[0], 'MD058', around('Tables'));
    if (!gap(rows.at(-1) + 1)) add(rows.at(-1), 'MD058', around('Tables'));
    rows.forEach((row, n) => {
      const style = pipeStyle(texts[row]);
      expected ??= style;
      const diff = style ^ expected, bit = diff & 2 || diff;
      if (diff) {
        const problem = `${expected & bit ? 'Missing' : 'Unexpected'} ${bit === 2 ? 'leading' : 'trailing'} pipe`;
        const names = `Expected: ${PIPE_STYLES[expected]}; Actual: ${PIPE_STYLES[style]}`;
        add(row, 'MD055', `Table pipe style [${names}; ${problem}]`);
      }
      const count = cells(texts[row]).length;
      if (n > 1 && count !== columns) {
        const detail = count > columns
          ? 'Too many cells, extra data will be missing' : 'Too few cells, row will be missing data';
        add(row, 'MD056', `Table column count [Expected: ${columns}; Actual: ${count}; ${detail}]`);
      }
      const spacing = compactProblem(texts[row], n === 1);
      if (spacing) add(row, 'MD060', `Table column style [${spacing}]`);
    });
  }
  return found.sort(byLine);
}
