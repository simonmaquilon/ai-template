// Table rules of rules.mjs (MD055, MD056, MD058, MD060) over the tables that blocks.mjs reads. `add`
// records a warning with its fix, `gap` tells whether a line leaves a table apart.

import { PIPE, cells } from './inline.mjs';

const PIPE_STYLES = ['no_leading_or_trailing', 'trailing_only', 'leading_only', 'leading_and_trailing'];
const COMPACT = 'for style "compact"';
const AROUND = 'Tables should be surrounded by blank lines';

const pipeStyle = (row) => (row.startsWith('|') ? 2 : 0) + (/(?<!\\)\|$/.test(row) ? 1 : 0);

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

// The row in compact style, keeping its pipe style and, in the delimiter row, its alignment colons, or null when a pipe
// may not separate cells (code or an escape could hide one).
function compactRow(row, delimiter) {
  if (/[`\\]/.test(row)) return null;
  const leading = row.startsWith('|'), trailing = row.endsWith('|'), parts = cells(row);
  const body = parts.map((part, j) => {
    const text = part.trim();
    const cell = delimiter ? `${text.startsWith(':') ? ':' : ''}---${text.endsWith(':') ? ':' : ''}` : text;
    const left = leading || j > 0 ? ' ' : '', right = trailing || j < parts.length - 1 ? ' ' : '';
    return cell ? left + cell + right : left && right;
  });
  return (leading ? '|' : '') + body.join('|') + (trailing ? '|' : '');
}

export function tableWarnings({ texts, tables }, gap, add, fix) {
  let expected;
  for (const { rows } of tables) {
    const columns = cells(texts[rows[0]]).length;
    if (!gap(rows[0] - 1)) add(rows[0], 'MD058', AROUND, fix.blank('before', rows[0]));
    if (!gap(rows.at(-1) + 1)) add(rows.at(-1), 'MD058', AROUND, fix.blank('after', rows.at(-1)));
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
      if (!spacing) return;
      const compact = compactRow(texts[row], n === 1);
      add(row, 'MD060', `Table column style [${spacing}]`, compact === null ? undefined : fix.text(row, compact));
    });
  }
}
