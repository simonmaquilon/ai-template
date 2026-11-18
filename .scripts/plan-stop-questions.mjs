const LEAD = String.raw`^\s*(?:[-*+]\s+|\d+[.)]\s+)?`;
const ID = String.raw`P-\d{2,}`;
const OPEN = new RegExp(`${LEAD}(⏳|⚠)\uFE0F?`);
const REPORT_ID = new RegExp(String.raw`^[ \t]+(?:\[partial\][ \t]+)?\[(${ID})\]`);
const MARKS = /\[(?:asked the user|accepted by the user) \d{4}-\d{2}-\d{2}\]/g;
const NUMBER = String.raw`(?<![\p{L}\p{N}])(\d{2})(?![\p{L}\p{N}])`;
const FINAL = new RegExp(String.raw`^ {0,3}[-*+][ \t]+(Handoff )?(?:\[(${ID})\]|fragment (\d{2}))(?:[ \t]+\[([^\]]+)\])?[ \t]+(.+[?？])[ \t]*$`, 'u');

export const withoutMarks = (line) => line.replace(MARKS, '').trimEnd();

export function openLine(line) {
  const open = OPEN.exec(line);
  if (!open) return null;
  const id = REPORT_ID.exec(line.slice(open[0].length))?.[1];
  return { id, pending: open[1] === '⏳' };
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
  const ranges = text.replace(new RegExp(`${NUMBER}\\s*(?:-|\u2013|\u2014|\\s(?:to|a)\\s)\\s*${NUMBER}`, 'gu'), (_, from, to) => {
    for (let n = Number(from); n <= Number(to); n++) numbers.add(String(n).padStart(2, '0'));
    return ' ';
  });
  for (const [, number] of ranges.matchAll(new RegExp(NUMBER, 'gu'))) numbers.add(number);
  return numbers;
}
