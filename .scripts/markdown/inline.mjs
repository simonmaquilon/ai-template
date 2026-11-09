// Text helpers of rules.mjs, pure functions of one line of text: code spans, bare URLs, table cells and the
// escaping of text that a warning copies from the file.

// Link and image pattern that cannot contain its own opener, so no scan restarts from every opener; repeated, it strips
// nested ones innermost first.
const LINK = /!?\[[^[\]]*\](?:\([^()]*\)|\[[^[\]]*\])|!\[[^[\]]*\]/g;
const STRIP = [/^[^[]*\]\([^()]*\)/, LINK, LINK, LINK, /<[^<>]*>/g];
export const PIPE = /(?<!\\)\|/;
const BARE = /(?<![^\s*_~(])(?:https?:\/\/|www\.)\S+|(?<![^\s*~(])[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z][\w-]*/i;

// Replaces every code span, which a backtick run closes with the next run of the same length, by what inCode returns
// for its content, in linear time.
export function splitCode(text, inCode) {
  const parts = text.split(/(`+)/), later = new Map(), closer = [];
  for (let i = parts.length - 2; i > 0; i -= 2) {
    closer[i] = later.get(parts[i].length);
    later.set(parts[i].length, i);
  }
  let out = parts[0];
  for (let i = 1; i < parts.length; i += 2) {
    if (closer[i] === undefined) out += parts[i] + parts[i + 1];
    else out += inCode(parts.slice(i + 1, closer[i]).join('')) + parts[(i = closer[i]) + 1];
  }
  return out;
}

// Blanks the code spans.
export const stripCode = (text) => splitCode(text, () => ' ');

// The text with control characters, line separators and characters that change text direction escaped, so that text a
// file holds cannot split, forge or reorder a line of output.
export const escapeText = (text) => text.replace(/[\p{Cc}\p{Bidi_Control}\u2028\u2029]/gu,
  (char) => `\\u${char.codePointAt(0).toString(16).padStart(4, '0')}`);

export const hasBare = (text) => !/^\[[^\]]+\]:/.test(text)
  && BARE.test(STRIP.reduce((t, re) => t.replace(re, ' '), stripCode(text)));

// Cells of a table row, without the empty pieces its leading and trailing pipes leave.
export function cells(row) {
  const parts = row.trim().split(PIPE);
  if (parts[0] === '') parts.shift();
  if (parts.at(-1) === '') parts.pop();
  return parts;
}
