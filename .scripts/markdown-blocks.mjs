// Line-based reading of CommonMark/GFM blocks for markdown-rules.mjs, which backs the edit hook and manual check of
// check-markdown.mjs (rule 10-documents.md). An approximation, not a full parser: it classifies every line (skip for
// front matter, blank, code, fence, comment, html, heading, setext, rule, item, para, table) and collects headings,
// list items, lists, fences, tables, and the blockquote prefix of every line. It never reads files or the environment.

import { frontMatterLength } from './markdown-front.mjs';
import { headingText } from './markdown-headings.mjs';
import { HTML_BLOCK, openHtml } from './markdown-html.mjs';
import { PIPE, cells } from './markdown-inline.mjs';
import { changeQuote } from './markdown-quotes.mjs';

const FENCE = /^(?:(`{3,})([^`]*)|(~{3,})(.*))$/;
const QUOTE = /^(?: {0,3}>[ \t]?)*/;
const HEADING = /^#{1,6}(?=[ \t]|$)/;
const MARKER = /^(?:([-*+])|(\d{1,9})([.)]))(?=[ \t]|$)/;
const DELIMITER = /^\|?\s*:?-+:?(?:\s*\|\s*:?-+:?)*\s*(?:\|\s*)?$/;
const STARTS = [
  ['fence', FENCE], ['heading', HEADING], ['rule', /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/], ['item', MARKER],
  ['comment', /^<!--/], ['html', /^<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^>]*)?\/?>$/], ['html', HTML_BLOCK],
];

export function readBlocks(text) {
  const lines = text.split(/\r\n?|\n/);
  const kinds = lines.map(() => 'blank');
  const texts = lines.map(() => '');
  const out = { lines, kinds, texts, quotes: lines.map(() => ''), headings: [], items: [], lists: [], fences: [],
    tables: [] };
  let stack = [], closed = [], saved = [], fence = null, html = null, table = null, depth = 0, para = -1, owner = null;

  // Classifies line i; stack holds the open list items, closed the last item that ended at each depth.
  const classify = (i) => {
    const quote = (out.quotes[i] = QUOTE.exec(lines[i])[0]);
    const rest = lines[i].slice(quote.length);
    const s = (texts[i] = rest.trim());
    const q = quote.split('>').length - 1;
    const ind = /^[ \t]*/.exec(rest)[0].replace(/\t/g, '    ').length;
    // A fence ends with its quote, and with its list item at a line that is not indented to the item's content.
    if (fence && (q < fence.q || (q === fence.q && s && ind < fence.col))) {
      [fence.close, fence.unclosed, fence] = [MARKER.test(s) ? i : i - 1, true, null];
    }
    if (fence) {
      const m = q === fence.q && ind - fence.col < 4 && /^(`{3,}|~{3,})$/.exec(s);
      if (!m || m[1][0] !== fence.ch || m[1].length < fence.len) return 'code';
      fence.close = i;
      fence = null;
      return 'fence';
    }
    if (html?.end) {
      const { kind, end } = html;
      if (end.test(s)) html = null;
      return kind;
    }
    // A line that leaves a quote and starts no block continues the paragraph of that quote, which stays open.
    const lazy = q < depth && para >= 0 ? [depth, stack, closed, [...saved]] : null;
    const change = (q !== depth || saved.length > 0) && changeQuote(saved, stack, closed, quote, depth, q);
    if (change) {
      if (change[2]) para = -1;
      [depth, stack, closed, table] = [q, change[0], change[1], null];
    }
    if (!s) {
      [para, table, html] = [-1, null, null];
      return 'blank';
    }
    if (html) return 'html';
    const open = para >= 0 || table !== null;
    const top = () => stack.at(-1) ?? null;
    let rel = ind - (top()?.col ?? 0);
    let start = rel < 4 ? STARTS.find(([, re]) => re.test(s))?.[0] ?? '' : '';
    if (para >= 0 && !lazy && rel >= 0 && rel < 4 && owner === top() && /^(?:=+|-+)[ \t]*$/.test(s)) {
      const text = texts.slice(para, i).join(' ');
      out.headings.push({ start: para, end: i, level: s[0] === '=' ? 1 : 2, text });
      para = -1;
      return 'setext';
    }
    const before = stack.length;
    if (!open || start) {
      while (stack.length && stack.at(-1).col > ind) closed[stack.at(-1).depth] = stack.pop();
    }
    rel = ind - (top()?.col ?? 0);
    if (rel >= 4) start = '';
    if (rel >= 4 && !open) return 'code';
    const m = start === 'item' && MARKER.exec(s);
    const tail = m ? s.slice(m[0].length) : '';
    const after = tail.trim();
    // A list interrupts a paragraph only with a non-empty first item that, when ordered, starts at 1.
    if (m && para >= 0 && !lazy && stack.length === before && (!after || (m[2] && +m[2] !== 1))) start = '';
    if (start) table = null;
    if (start === 'fence') {
      const f = FENCE.exec(s), marks = f[1] ?? f[3];
      out.fences.push(fence = { open: i, close: -1, info: (f[2] ?? f[4]).trim(), ch: marks[0], len: marks.length, q,
        col: top()?.col ?? 0 });
      para = -1;
      return 'fence';
    }
    if (start === 'heading') {
      const level = HEADING.exec(s)[0].length;
      out.headings.push({ start: i, end: i, level, text: headingText(s, level) });
      para = -1;
      return 'heading';
    }
    if (start === 'rule' || start === 'comment' || start === 'html') {
      para = -1;
      if (start !== 'rule') html = openHtml(start, s);
      return start;
    }
    if (start === 'item') {
      const key = m[1] ?? m[3], ordered = !!m[2], prev = closed[stack.length], parent = top();
      let list = prev && prev.ordered === ordered && prev.key === key ? prev.list : null;
      if (!list) out.lists.push(list = { depth: stack.length + saved.length, start: i, end: i, ordered, items: [] });
      closed.length = stack.length;
      const gap = tail.length - tail.trimStart().length;
      const item = { line: i, depth: stack.length, ordered, key, num: +(m[2] ?? 0), mcol: ind, list,
        col: ind + m[0].length + (!after || gap > 4 ? 1 : gap), parent,
        pure: !parent || (!parent.ordered && parent.pure) };
      list.items.push(item);
      out.items.push(item);
      stack.push(item);
      texts[i] = after;
      [para, owner] = [after ? i : -1, item];
      return 'item';
    }
    if (lazy) {
      [depth, stack, closed, saved] = lazy;
      return 'para';
    }
    if (table) {
      table.rows.push(i);
      return 'table';
    }
    if (para >= 0 && kinds[i - 1] === 'para' && s.includes('|') && DELIMITER.test(s) && PIPE.test(texts[i - 1])
      && cells(texts[i - 1]).length === cells(s).length) {
      out.tables.push(table = { rows: [i - 1, i] });
      [kinds[i - 1], para] = ['table', -1];
      return 'table';
    }
    if (para < 0) [para, owner] = [i, top()];
    return 'para';
  };

  const first = frontMatterLength(text);
  kinds.fill('skip', 0, first);
  for (let i = first; i < lines.length; i++) {
    kinds[i] = classify(i);
    const blank = kinds[i] === 'blank' || (kinds[i] === 'code' && !texts[i]);
    if (!blank) for (const item of [...stack, ...saved.flatMap((f) => f.stack)]) item.list.end = i;
    if (!blank && kinds[i] !== 'item') closed.length = Math.min(closed.length, stack.length);
  }
  return out;
}
