// HTML block starts for blocks.mjs, after CommonMark: HTML_BLOCK matches a line that starts a block of type 1
// to 6 (type 2, the comment, aside), and openHtml says how the block ends. Types 1 to 5 end at a line that holds their
// own end condition, blank lines included; type 6 and the lone tags of type 7 end at a blank line. It never reads
// files or the environment.

const BLOCK_TAGS = ('address article aside base basefont blockquote body caption center col colgroup dd details dialog dir '
  + 'div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li '
  + 'link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead '
  + 'title tr track ul').split(' ');
export const HTML_BLOCK = new RegExp(`^(?:</?(?:${BLOCK_TAGS.join('|')})(?:[ \\t]|/?>|$)`
  + '|<(?:pre|script|style|textarea)(?:[ \\t>]|$)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)', 'i');
// [start, end] of the types that end at their own condition.
const RAW = [[/^<!--/, /-->/], [/^<(?:pre|script|style|textarea)(?:[ \t>]|$)/i, /<\/(?:pre|script|style|textarea)>/i],
  [/^<\?/, /\?>/], [/^<![A-Za-z]/, />/], [/^<!\[CDATA\[/, /\]\]>/]];

// The state of the block the line s opens, kind being 'comment' or 'html': null when the line closes it too, otherwise
// { kind, end } with the pattern whose match ends it, or null for a block that ends at a blank line.
export function openHtml(kind, s) {
  const end = RAW.find(([start]) => start.test(s))?.[1] ?? null;
  return end?.test(kind === 'comment' ? s.slice(4) : s) ? null : { kind, end };
}
