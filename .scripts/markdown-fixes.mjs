// The correction each warning of markdown-rules.mjs carries in its `fix` field, so that a later --fix applies what the
// engine knows instead of parsing messages. Columns count UTF-16 units of the line as readBlocks splits it and lines
// count from 1, like the warnings. The operations:
//   { op: 'report' }                           no correction the engine knows: a person decides
//   { op: 'edit', at, remove, insert }         on the warning's line, replace `remove` characters from column `at`
//   { op: 'delete-line' }                      drop the warning's line
//   { op: 'blank', where, line, prefix }       add a line holding `prefix` (the blockquote prefix, '' outside quotes)
//                                              before or after (`where`) the given line
//   { op: 'final-newline' }                    end the file with a newline

export const REPORT = { op: 'report' };
export const DELETE_LINE = { op: 'delete-line' };
export const FINAL_NEWLINE = { op: 'final-newline' };

export function fixesFor({ lines, quotes, texts }) {
  const lead = (i) => /^[ \t]*/.exec(lines[i].slice(quotes[i].length))[0].length;
  const column = (i) => quotes[i].length + lead(i);
  const edit = (at, remove, insert) => ({ op: 'edit', at, remove, insert });
  return {
    bullet: (i) => edit(column(i), 1, '-'),
    indent: (i, width) => edit(quotes[i].length, lead(i), ' '.repeat(width)),
    trailing: (i, count) => edit(lines[i].length - count, count, ''),
    language: ({ open, len }) => edit(column(open) + len, 0, 'text'),
    text: (i, insert) => edit(column(i), texts[i].length, insert),
    blank: (where, i) => ({ op: 'blank', where, line: i + 1, prefix: quotes[i].trimEnd() }),
  };
}
