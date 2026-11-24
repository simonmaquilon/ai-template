// What opens a report line: a list bullet, a quote, a task box, or emphasis, in any number and order, before the mark.
const LEAD = /^[ \t]*(?:(?:>|[-*+](?=[ \t])|\d+[.)](?=[ \t])|\[[ xX]\](?=[ \t])|[*_]{1,3}(?=\S))[ \t]*)*/;
const QUOTE = /^[ \t]*(?:>[ \t]*)*/;
const MARK = /^(⏳|⚠|🚫)\p{Variation_Selector}?/u;
const CELL = /^[ \t]*[*_]{0,3}[ \t]*(⏳|⚠|🚫)/;
const ID = String.raw`P-\d{2,}`;
const ROW_ID = new RegExp(String.raw`\[(${ID})\]`);
const REPORT_ID = new RegExp(String.raw`^[*_]*[ \t]+(?:\[partial\][ \t]+)?\[(${ID})\]`);
const DATE = String.raw`\d{4}-\d{2}-\d{2}`;
const MARKS = new RegExp(String.raw`\[(?:asked the user|accepted by the user) ${DATE}\]|\[answered ${DATE} ${ID}\]`, 'g');
const ANSWERED = new RegExp(String.raw`\[answered ${DATE} (${ID})\]`, 'g');
const NUMBER = String.raw`(?<![\p{L}\p{N}])(\d{2})(?![\p{L}\p{N}])`;
const FINAL = new RegExp(String.raw`^ {0,3}[-*+][ \t]+(Handoff )?(?:\[(${ID})\]|fragment (\d{2}))(?:[ \t]+\[([^\]]+)\])?[ \t]+(.+[?？])[ \t]*$`, 'u');

export const withoutMarks = (line) => line.replace(MARKS, '').trimEnd();

// The identifiers a line marks as answered with `[answered YYYY-MM-DD P-01]`; the mark closes nothing without a receipt.
export const answeredMarks = (line) => [...line.matchAll(ANSWERED)].map(([, id]) => id);

// Whether a report line is open, and its identifier: the mark opens a line of text, or a cell of a table row, which the
// identifier may stand anywhere in. A mark in mid-text, and a table separator, open nothing.
export function openLine(line) {
  const row = line.slice(QUOTE.exec(line)[0].length);
  if (row.startsWith('|')) {
    const mark = row.split('|').slice(1).map((cell) => CELL.exec(cell)?.[1]).find(Boolean);
    return mark ? { id: ROW_ID.exec(row)?.[1], pending: mark === '⏳' } : null;
  }
  const lead = LEAD.exec(line)[0].length;
  const open = MARK.exec(line.slice(lead));
  if (!open) return null;
  return { id: REPORT_ID.exec(line.slice(lead + open[0].length))?.[1], pending: open[1] === '⏳' };
}

// The open lines of a report with their line index, outside fenced code blocks, which a quote may hold.
export function openLines(text) {
  let fence = '';
  return text.split(/\r?\n/).flatMap((line, at) => {
    const boundary = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(line.slice(QUOTE.exec(line)[0].length));
    if (boundary) {
      if (!fence) fence = boundary[1];
      else if (boundary[1][0] === fence[0] && boundary[1].length >= fence.length && !boundary[2].trim()) fence = '';
      return [];
    }
    const open = fence ? null : openLine(line);
    return open ? [{ ...open, line, at }] : [];
  });
}

// Only questions in the client's final assistant message can pause a stop. They carry no approval.
export function finalQuestions(input, subagent) {
  if (input.hook_event_name !== (subagent ? 'SubagentStop' : 'Stop') || typeof input.last_assistant_message !== 'string') return [];
  const questions = [];
  let fence = '';
  let comment = false;
  for (const line of input.last_assistant_message.split(/\r?\n/)) {
    const boundary = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!comment && boundary) {
      if (!fence) fence = boundary[1];
      else if (boundary[1][0] === fence[0] && boundary[1].length >= fence.length && !boundary[2].trim()) fence = '';
      continue;
    }
    if (fence) continue;
    const opensComment = line.lastIndexOf('<!--');
    const closesComment = line.lastIndexOf('-->');
    if (comment || opensComment !== -1) {
      comment = opensComment > closesComment || (comment && closesComment === -1);
      continue;
    }
    const match = FINAL.exec(line);
    if (!match) continue;
    const [, handoff, id, fragment, plan, question] = match;
    if (Boolean(handoff) !== subagent || (!handoff && !id)) continue;
    if ((question.match(/\p{L}[\p{L}\p{M}]*/gu) ?? []).length < 2) continue;
    questions.push({ id, fragment, plan });
  }
  return questions;
}

// The fragment numbers named by a pending line, outside paths, dates, identifier labels, times, and amounts.
export function namedFragments(line) {
  const text = withoutMarks(line).replace(new RegExp(String.raw`\[${ID}\]`, 'g'), ' ')
    .replace(/\S*[\\/]\S*|\S+\.\w+|\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}(?::\d{2})?|\d+\s*(?:%|(?:ms|s|min|h|[KMG]B|files?|lines?|tests?)\b)/g, ' ');
  const numbers = new Set();
  const ranges = text.replace(new RegExp(`${NUMBER}\\s*(?:-|–|—|\\s(?:to|a)\\s)\\s*${NUMBER}`, 'gu'), (_, from, to) => {
    for (let n = Number(from); n <= Number(to); n++) numbers.add(String(n).padStart(2, '0'));
    return ' ';
  });
  for (const [, number] of ranges.matchAll(new RegExp(NUMBER, 'gu'))) numbers.add(number);
  return numbers;
}
