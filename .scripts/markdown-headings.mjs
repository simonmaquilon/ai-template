// First-heading (MD041) and link-fragment (MD051) rules of markdown-rules.mjs, as markdownlint 0.41.1 applies them.
// MD041 widens its front_matter_title option to `name`, so that a definition with `name:` needs no heading. MD051 only
// detects: a person decides whether to fix the link or the heading. `add` records a warning.

import { escapeText, splitCode, stripCode } from './markdown-inline.mjs';

const TITLE = /^\s*"?(?:title|name)"?\s*[:=]/i;
const NOT_WORD = /[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu;
// The fragment of a link destination that cannot hold a parenthesis, so no scan restarts inside another's text.
const DESTINATION = /\(\s*<?(#[^()\s>]*)(?=[)\s>])/y;
const LINE_FRAGMENT = /^#(?:L\d+(?:C\d+)?-L\d+(?:C\d+)?|L\d+)$/;
// Image and link of a heading, whose text cannot hold a bracket, so no scan restarts from every opener.
const IMAGE = /!\[[^[\]]*\](?:\([^()]*\)|\[[^[\]]*\])/g;
const LINK = /\[([^[\]]*)\](?:\([^()]*\)|\[[^[\]]*\])/g;
const TAG = /<([A-Za-z][\w-]*)(\s[^<>]*)?>/g;
const ANCHOR = /\{(#[a-z\d]+(?:[-_][a-z\d]+)*)\}/g;
const unescape = (text) => text.replace(/\\([!-/:-@[-`{-~])/g, '$1');
// encodeURIComponent throws on a lone surrogate, which becomes U+FFFD first.
const encode = (text) => encodeURIComponent(text.replace(/\p{Cs}/gu, '\uFFFD'));
const ID = /\sid\s*=\s*['"]?([^'"\s>]*)/i;
const NAME = /\sname\s*=\s*['"]?([^'"\s>]*)/i;

// Text of an ATX heading line of the given level, without its optional closing sequence of # (a space or tab must
// precede it); string operations keep the cost linear.
export function headingText(s, level) {
  const text = s.slice(level);
  let end = text.length;
  while (text[end - 1] === '#') end--;
  return (' \t'.includes(text[end - 1]) ? text.slice(0, end) : text).trim();
}

// lead is the index of the first line with content: no warning for an empty file or a title in the front matter.
export function firstHeadingWarning({ lines, kinds, texts, quotes, headings }, lead, add) {
  if (lead < 0 || lines.some((line, i) => kinds[i] === 'skip' && TITLE.test(line))) return;
  const heading = headings.some((h) => h.start === lead && h.level === 1);
  const html = ['html', 'para'].includes(kinds[lead]) && /^<h1[\s/>]/i.test(texts[lead]);
  if (quotes[lead] || !(heading || html)) add(lead, 'MD041', 'First line in a file should be a top-level heading');
}

// Whether the underscore run `run` at `at` of text takes no part in the fragment (emphasis markers): it follows a
// character that is not a letter or digit and precedes a non-space, or it follows a non-space and either precedes a
// character that is not a letter or digit or holds more than one underscore. Checked per run, so that a long run costs
// no more than its length.
function dropUnderscores(run, at, text) {
  const before = Array.from(text.slice(Math.max(0, at - 2), at)).at(-1);
  const next = text.codePointAt(at + run.length);
  const after = next === undefined ? undefined : String.fromCodePoint(next);
  const word = (char) => char !== undefined && /[\p{L}\p{N}]/u.test(char);
  const solid = (char) => char !== undefined && !/\s/.test(char);
  return (!word(before) && solid(after)) || (solid(before) && (!word(after) || run.length > 1)) ? '' : run;
}

// Fragment GitHub gives a heading: its visible text, lowercase, without punctuation but hyphens and underscores.
function fragment(text) {
  const spans = [];
  let next = 0;
  const visible = unescape(splitCode(text, (code) => (spans.push(code), '\0'))
    .replace(IMAGE, '')
    .replace(LINK, '$1')
    .replace(/<[^<>]*>|&#?\w+;/g, '')
    .replace(/_+/g, dropUnderscores));
  return `#${encode(visible.replace(/\0/g, () => spans[next++]).toLowerCase().replace(NOT_WORD, '').replace(/ /g, '-'))}`;
}

// The fragment each same-file link of a line points to, in order, skipping images.
function* destinations(text) {
  const opens = [];
  for (let k = 0; k < text.length; k++) {
    if (text[k] === '\\') k++;
    else if (text[k] === '[') opens.push(text[k - 1] === '!');
    else if (text[k] === ']' && opens.pop() === false && text[k + 1] === '(') {
      DESTINATION.lastIndex = k + 1;
      const found = DESTINATION.exec(text);
      if (found) yield unescape(found[1]);
    }
  }
}

export function fragmentWarnings({ kinds, texts, headings }, add) {
  const known = new Map([['#top', 0]]);
  for (const { text } of headings) {
    const slug = fragment(text);
    if (slug === '#') continue;
    const count = known.get(slug) ?? 0;
    if (count) known.set(`${slug}-${count}`, 0);
    known.set(slug, count + 1);
    for (const [, anchor] of text.matchAll(ANCHOR)) known.set(anchor, known.get(anchor) ?? 1);
  }
  const hidden = ['skip', 'code', 'fence', 'comment', 'blank'];
  const lines = texts.map((text, i) => (hidden.includes(kinds[i]) ? '' : stripCode(text)));
  for (const [tag, name] of lines.flatMap((line) => [...line.matchAll(TAG)])) {
    const id = ID.exec(tag) ?? (name.toLowerCase() === 'a' && NAME.exec(tag));
    if (id) known.set(`#${id[1]}`, 0);
  }
  const lower = new Map();
  for (const key of known.keys()) if (!lower.has(key.toLowerCase())) lower.set(key.toLowerCase(), key);
  lines.forEach((line, i) => {
    if (kinds[i] === 'html') return;
    const definition = kinds[i] === 'para' && /^\[[^\]]+\]:\s*<?(#[^\s>]*)/.exec(line);
    for (const text of definition ? [unescape(definition[1])] : destinations(line)) {
      const encoded = `#${encode(text.slice(1))}`;
      if (text.length < 2 || known.has(encoded) || LINE_FRAGMENT.test(encoded)) continue;
      const similar = lower.get(text.toLowerCase());
      if (similar === text) continue;
      const detail = similar ? ` [Expected: ${escapeText(similar)}; Actual: ${escapeText(text)}]` : '';
      add(i, 'MD051', `Link fragments should be valid${detail}`);
    }
  });
}
