// Reads, for check-plan-stop.mjs, the plans prompt-plan keeps under .temp/plans/: which ones an execution touched
// since a moment, and what in each still keeps that execution from ending under the skill's Ending an execution rule
// (prompt-plan, references/execution.md). Every file is read without following a symlink, since a sandboxed command
// can write .temp/ while the hook runs outside the sandbox.

import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, readdirSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { inFolder, openRegular } from './safe-fs.mjs';

export const PLANS = '.temp/plans';
export const UNREADABLE = Symbol('unreadable');
const MAX_BYTES = 1024 * 1024;
// The two marks the skill fixes for a report line: a question put to the user, and a risk or pending step the user
// accepted as it stands, each with the date.
const MARKS = /\[(?:asked the user|accepted by the user) \d{4}-\d{2}-\d{2}\]/g;
const marked = (line) => line.search(MARKS) !== -1;
const LEAD = String.raw`^\s*(?:[-*+]\s+|\d+[.)]\s+)?`;
const OPEN = new RegExp(`${LEAD}(?:\u23f3|\u26a0)`);
const PENDING = new RegExp(`${LEAD}\u23f3`);
// A row of build/00-index.md, as record.mjs finds it: its first cell links NN-<slug>.md, its last cell is the status.
const ROW = /^\s*\|[^|]*\]\((?:\.\/)?(\d{2})-[^)/]*\.md\)/;
const STATUS = /\|[ \t]*`?(pending|failed|blocked|done)`?[ \t]*\|[ \t\r]*$/;
// What an execution writes: time.mjs, the report, the index that record.mjs updates, and the patch records.
const WRITTEN = ['review/times.log', 'review/report.md', 'build/00-index.md', 'patch'];

const planPath = (root, plan, ...rest) => join(root, ...PLANS.split('/'), plan, ...rest);
const mtime = (path) => lstatSync(path, { throwIfNoEntry: false })?.mtimeMs ?? -1;

// A plan file's text: null when it does not exist, UNREADABLE when it is no regular file of at most MAX_BYTES or a
// symlink leads anywhere on the way to it.
export function readPlanFile(root, plan, path) {
  const segments = path.split('/');
  const name = segments.pop();
  try {
    const text = inFolder(root, [PLANS, plan, ...segments].join('/'), false, () => {
      if (!lstatSync(name, { throwIfNoEntry: false })) return null;
      const fd = openRegular(name, constants.O_RDONLY);
      try {
        const { size } = fstatSync(fd);
        if (size > MAX_BYTES) return UNREADABLE;
        const buffer = Buffer.alloc(size);
        let read = 0;
        for (let count = 1; read < size && count > 0; read += count) count = readSync(fd, buffer, read, size - read, read);
        return buffer.subarray(0, read).toString('utf8');
      } finally {
        closeSync(fd);
      }
    });
    return text === undefined ? UNREADABLE : text;
  } catch (error) {
    return error.code === 'ENOENT' ? null : UNREADABLE;
  }
}

// The plan folders under .temp/plans/, in order; a missing folder holds none.
export function planFolders(root) {
  try {
    return readdirSync(join(root, ...PLANS.split('/')), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

// Whether the plan's execution has started, which time.mjs marks with review/times.log.
export const started = (root, plan) => lstatSync(planPath(root, plan, 'review', 'times.log'), { throwIfNoEntry: false })?.isFile() === true;

// Whether an execution wrote any of the plan's files at or after `since`, a time in milliseconds.
export const touchedSince = (root, plan, since) => WRITTEN.some((path) => mtime(planPath(root, plan, ...path.split('/'))) >= since);

// The last line of review/times.log, or '' when it has none.
export function lastTime(root, plan) {
  const times = readPlanFile(root, plan, 'review/times.log');
  return typeof times === 'string' ? times.split('\n').filter(Boolean).at(-1) ?? '' : '';
}

// Whether a line of times.log opens a fragment's segment, which only a wait line closes.
export const opensFragment = (line) => /^\S+\t\d{2}\t/.test(line);

// A key for a report line that ignores where it stands, so that moving it changes nothing.
export const lineKey = (line) => createHash('sha256').update(line.trim()).digest('hex').slice(0, 16);

// The keys of the open lines of the plan's report, which a subagent inherits when it starts.
export function openKeys(root, plan) {
  const report = readPlanFile(root, plan, 'review/report.md');
  return typeof report === 'string' ? report.split('\n').filter((line) => OPEN.test(line)).map(lineKey) : [];
}

// The fragments whose patch/NN.before, which record NN after removes, was written at or after `since` and before `until`.
function openedBetween(root, plan, since, until) {
  const patch = planPath(root, plan, 'patch');
  const names = lstatSync(patch, { throwIfNoEntry: false })?.isDirectory() ? readdirSync(patch) : [];
  return names.map((name) => /^(\d{2})\.before$/.exec(name)?.[1]).filter(Boolean)
    .filter((number) => mtime(join(patch, `${number}.before`)) >= since && mtime(join(patch, `${number}.before`)) < until);
}

// The fragment numbers a line names: two-digit words of their own, outside paths, file names, dates, times, and amounts
// such as 10 min or 80%, and every number of a range such as 02-04, 02 to 04, or 02 a 04, also with an en or em dash.
const NUMBER = String.raw`(?<![\p{L}\p{N}])(\d{2})(?![\p{L}\p{N}])`;
export function namedFragments(line) {
  const text = line.replace(MARKS, ' ').replace(/\S*[\\/]\S*|\S+\.\w+|\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}(?::\d{2})?|\d+\s*(?:%|(?:ms|s|min|h|[KMG]B|files?|lines?|tests?)\b)/g, ' ');
  const numbers = new Set();
  const ranges = text.replace(new RegExp(`${NUMBER}\\s*(?:-|\u2013|\u2014|\\s(?:to|a)\\s)\\s*${NUMBER}`, 'gu'), (_, from, to) => {
    for (let n = Number(from); n <= Number(to); n++) numbers.add(String(n).padStart(2, '0'));
    return ' ';
  });
  for (const [, number] of ranges.matchAll(new RegExp(NUMBER, 'gu'))) numbers.add(number);
  return numbers;
}

const clip = (line) => {
  const text = line.trim().replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ');
  return text.length > 200 ? `${text.slice(0, 199)}\u2026` : text;
};

// What keeps the plan's execution from ending, one line each, or the paths that could not be read. For a subagent,
// `agent` gives when it started, when the next subagent of its session started, and the keys of the open report lines
// it inherited: only the fragments whose before record it opened between the two and the lines it wrote count.
export function openItems(root, plan, agent = null) {
  const index = readPlanFile(root, plan, 'build/00-index.md');
  const report = readPlanFile(root, plan, 'review/report.md');
  const unreadable = [['build/00-index.md', index], ['review/report.md', report]].filter(([, text]) => text === UNREADABLE);
  if (unreadable.length > 0) return { unreadable: unreadable.map(([path]) => path) };
  const rows = (index ?? '').split('\n').flatMap((line) => {
    const status = ROW.test(line) && STATUS.exec(line);
    return status ? [{ number: ROW.exec(line)[1], status: status[1] }] : [];
  });
  const lines = (report ?? '').split('\n');
  const named = new Set(lines.filter((line) => PENDING.test(line) && marked(line)).flatMap((line) => [...namedFragments(line)]));
  const unnamed = (status) => rows.filter((row) => row.status === status && !named.has(row.number)).map((row) => row.number);
  const items = [];
  if (agent) {
    const own = new Set(openedBetween(root, plan, agent.since, agent.until));
    const left = rows.filter((row) => row.status !== 'done' && own.has(row.number) && !named.has(row.number));
    if (left.length > 0) items.push(`build/00-index.md: fragment ${left.map((row) => `${row.number} (${row.status})`).join(', ')}, whose before record this subagent opened, is not done and no marked \u23f3 line names it`);
  } else {
    const stopped = rows.some((row) => row.status === 'failed' || row.status === 'blocked');
    if (!stopped && unnamed('pending').length > 0) items.push(`build/00-index.md: fragments pending, with none failed or blocked, that no marked \u23f3 line names: ${unnamed('pending').join(', ')}`);
    for (const status of ['failed', 'blocked']) {
      for (const number of unnamed(status)) items.push(`build/00-index.md: fragment ${number} is ${status} and no marked \u23f3 line names it`);
    }
  }
  // A subagent with no record of the lines it inherited, as in a plan not in execution when it started, answers for none.
  const inherited = agent && new Set(agent.keys ?? []);
  lines.forEach((line, at) => {
    if (OPEN.test(line) && !marked(line) && !(agent && (!agent.keys || inherited.has(lineKey(line))))) items.push(`review/report.md:${at + 1}: ${clip(line)}`);
  });
  return { items };
}
