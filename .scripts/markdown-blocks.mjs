// Line-based reading of CommonMark/GFM blocks for markdown-rules.mjs, which backs the edit hook and manual check of
// check-markdown.mjs (rule 10-documents.md). An approximation, not a full parser: it classifies every line (skip for
// front matter, blank, code, fence, comment, html, heading, setext, rule, item, para, table) and collects headings,
// list items, lists, fences, and tables. It never reads files or the environment.

export const PIPE = /(?<!\\)\|/;
const FENCE = /^(?:(`{3,})([^`]*)|(~{3,})(.*))$/;
const HEADING = /^#{1,6}(?=[ \t]|$)/;
const MARKER = /^(?:([-*+])|(\d{1,9})([.)]))(?=[ \t]|$)/;
const DELIMITER = /^\|?\s*:?-+:?(?:\s*\|\s*:?-+:?)*\s*(?:\|\s*)?$/;
const STARTS = [
  ['fence', FENCE], ['heading', HEADING], ['rule', /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/], ['item', MARKER],
  ['comment', /^<!--/], ['html', /^<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^>]*)?\/?>$/],
];

// Text of an ATX heading line of the given level, without its optional closing sequence of # (a space or tab must
// precede it); string operations keep the cost linear.
function headingText(s, level) {
  const text = s.slice(level);
  let end = text.length;
  while (text[end - 1] === '#') end--;
  return (' \t'.includes(text[end - 1]) ? text.slice(0, end) : text).trim();
}

// Cells of a table row, without the empty pieces its leading and trailing pipes leave.
export function cells(row) {
  const parts = row.trim().split(PIPE);
  if (parts[0] === '') parts.shift();
  if (parts.at(-1) === '') parts.pop();
  return parts;
}

export function readBlocks(text) {
  const lines = text.split(/\r\n?|\n/);
  const kinds = lines.map(() => 'blank');
  const texts = lines.map(() => '');
  const out = { lines, kinds, texts, headings: [], items: [], lists: [], fences: [], tables: [] };
  let stack = [], closed = [], fence = null, html = null, table = null, depth = 0, para = -1, owner = null;

  // Classifies line i; stack holds the open list items, closed the last item that ended at each depth.
  const classify = (i) => {
    const quote = /^(?: {0,3}>[ \t]?)*/.exec(lines[i])[0];
    const rest = lines[i].slice(quote.length);
    const s = (texts[i] = rest.trim());
    const q = quote.split('>').length - 1;
    if (fence && q < fence.q) fence = null;
    if (fence) {
      const m = q === fence.q && /^(`{3,}|~{3,})$/.exec(s);
      if (!m || m[1][0] !== fence.ch || m[1].length < fence.len) return 'code';
      fence.close = i;
      fence = null;
      return 'fence';
    }
    if (html === 'comment') {
      if (s.includes('-->')) html = null;
      return 'comment';
    }
    if (q !== depth) {
      if (q > depth) para = -1;
      [depth, stack, closed, table] = [q, [], [], null];
    }
    if (!s) {
      [para, table, html] = [-1, null, null];
      return 'blank';
    }
    if (html) return 'html';
    const ind = /^[ \t]*/.exec(rest)[0].replace(/\t/g, '    ').length;
    const open = para >= 0 || table !== null;
    const top = () => stack.at(-1) ?? null;
    let rel = ind - (top()?.col ?? 0);
    let start = rel < 4 ? STARTS.find(([, re]) => re.test(s))?.[0] ?? '' : '';
    if (para >= 0 && rel >= 0 && rel < 4 && owner === top() && /^(?:=+|-+)[ \t]*$/.test(s)) {
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
    if (m && para >= 0 && stack.length === before && (!after || (m[2] && +m[2] !== 1))) start = '';
    if (start) table = null;
    if (start === 'fence') {
      const f = FENCE.exec(s), marks = f[1] ?? f[3];
      out.fences.push(fence = { open: i, close: -1, info: (f[2] ?? f[4]).trim(), ch: marks[0], len: marks.length, q });
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
      if (start !== 'rule') html = start === 'comment' && s.includes('-->', 4) ? null : start;
      return start;
    }
    if (start === 'item') {
      const key = m[1] ?? m[3], ordered = !!m[2], prev = closed[stack.length], parent = top();
      let list = prev && prev.ordered === ordered && prev.key === key ? prev.list : null;
      if (!list) out.lists.push(list = { depth: stack.length, start: i, end: i, ordered, items: [] });
      closed.length = stack.length;
      const gap = tail.length - tail.trimStart().length;
      const item = { line: i, depth: stack.length, ordered, key, num: +(m[2] ?? 0), mcol: ind, list,
        col: ind + m[0].length + (!after || gap > 4 ? 1 : gap), pure: !parent || (!parent.ordered && parent.pure) };
      list.items.push(item);
      out.items.push(item);
      stack.push(item);
      texts[i] = after;
      [para, owner] = [after ? i : -1, item];
      return 'item';
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

  const opener = lines[0].replace(/^\uFEFF/, '');
  const first = ['---', '+++'].includes(opener) ? lines.indexOf(opener, 1) + 1 : 0;
  kinds.fill('skip', 0, first);
  for (let i = first; i < lines.length; i++) {
    kinds[i] = classify(i);
    if (kinds[i] !== 'blank') for (const item of stack) item.list.end = i;
    if (kinds[i] !== 'blank' && kinds[i] !== 'item') closed.length = Math.min(closed.length, stack.length);
  }
  return out;
}
