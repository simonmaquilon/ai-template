// Front matter as markdownlint 0.41.1 reads it (its frontMatterRe, copied as is, anchored to the start of the text): a
// block between --- lines, TOML between +++ lines closed by +++ or ..., or JSON between { and } lines. Delimiters may
// carry trailing whitespace, and the blank lines after the closing one belong to the block. It never reads files or
// the environment.

const FRONT = /((^---[^\S\r\n\u2028\u2029]*$[\s\S]+?^---\s*)|(^\+\+\+[^\S\r\n\u2028\u2029]*$[\s\S]+?^(\+\+\+|\.\.\.)\s*)|(^\{[^\S\r\n\u2028\u2029]*$[\s\S]+?^\}\s*))(\r\n|\r|\n|$)/my;

// How many lines at the start of the text are front matter, 0 when there is none.
export function frontMatterLength(text) {
  FRONT.lastIndex = 0;
  const lines = FRONT.exec(text.replace(/^\uFEFF/, ''))?.[0].split(/\r\n?|\n/) ?? [];
  return lines.length - (lines.at(-1) === '' ? 1 : 0);
}
