// Keeps the times of the plan's executions: node time.mjs NN | wait <reason> | table
// Copied to check/time.mjs; all.mjs never runs it. NN and wait append one line to review/times.log, stamped with the
// current UTC time to the second: NN when the work on fragment NN starts or resumes, wait when a pause starts, such as
// a question to the user, a stop, a contention, or the end of an execution. Each line closes the segment the line
// before it opened, so the segments follow one another with no gap. table prints, writing nothing, the Markdown table
// of the closed segments in order, a fragment's row named by the first heading of its build file when its line was
// written, without the number, and a wait's by its reason, then the work, the waits, and the total, which is their sum
// and the time from the first line to the last. Start and end show local time, with the date when the lines span more
// than one day. Exit status: 0 on success, 2 on misuse or refusal, which writes nothing.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { planDir, reviewDir } from './lib.mjs';

const LOG = join(reviewDir, 'times.log');
const USAGE = 'Usage: node time.mjs NN | wait <reason> | table, where NN is a fragment number from 01 with one build/NN-<slug>.md file and the reason is one line without tabs.';
const refuse = (message) => {
  console.error(message);
  process.exit(2);
};
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
const LINE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\t(\d{2}|wait)\t([^\t]+)$/;
const lines = (existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean) : []).map((line, at, all) => {
  const [, stamp, kind, label] = LINE.exec(line) ?? [];
  const time = Date.parse(stamp);
  if (!stamp || Number.isNaN(time) || (at && time < Date.parse(LINE.exec(all[at - 1])?.[1]))) {
    refuse(`line ${at + 1} of review/times.log is no line time.mjs writes, or is earlier than the line before it; set it right by hand.`);
  }
  return { time, kind, label };
});

const append = (kind, label) => {
  const now = Math.floor(Date.now() / 1000) * 1000;
  if (lines.length && now < lines.at(-1).time) refuse(`The clock reads ${iso(now)}, earlier than the last line of review/times.log; run again once it reads ${iso(lines.at(-1).time)} or later.`);
  mkdirSync(reviewDir, { recursive: true });
  appendFileSync(LOG, `${iso(now)}\t${kind}\t${label}\n`);
  console.log(`review/times.log: ${kind === 'wait' ? `a pause, ${label},` : `the work on fragment ${kind}`} starts at ${iso(now)}.`);
};

const pad = (n) => String(n).padStart(2, '0');
const duration = (ms) => {
  const s = ms / 1000;
  const [h, m, sec] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  return h ? `${h} h ${pad(m)} min ${pad(sec)} s` : m ? `${m} min ${pad(sec)} s` : `${sec} s`;
};
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function table() {
  if (lines.length < 2) refuse('review/times.log holds no closed segment yet: its first line opens one, and the next NN or wait line closes it.');
  const [first, last] = [lines[0].time, lines.at(-1).time];
  const days = day(new Date(first)) !== day(new Date(last));
  const at = (ms) => {
    const d = new Date(ms);
    return `${days ? `${day(d)} ` : ''}${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const cell = (text) => text.replace(/\|/g, '\\|');
  const rows = lines.slice(0, -1).map((line, i) => ({ ...line, length: lines[i + 1].time - line.time, end: lines[i + 1].time }));
  const total = (wait) => rows.filter((row) => (row.kind === 'wait') === wait).reduce((sum, row) => sum + row.length, 0);
  console.log([
    '| # | Task | Start | End | Duration |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.kind === 'wait' ? `\u2014 | \u23f8\ufe0f Wait: ${cell(row.label)}` : `${row.kind} | ${cell(row.label)}`} | ${at(row.time)} | ${at(row.end)} | ${duration(row.length)} |`),
    `| | **Work** | | | **${duration(total(false))}** |`,
    `| | **Waits** | | | **${duration(total(true))}** |`,
    `| | **Total** | **${at(first)}** | **${at(last)}** | **${duration(last - first)}** |`,
  ].join('\n'));
  const open = lines.at(-1);
  if (open.kind !== 'wait') console.error(`Warning: fragment ${open.kind}'s segment, open since ${iso(open.time)}, is left out until a wait line closes it.`);
}

const [verb, ...rest] = process.argv.slice(2);
if (/^(?:0[1-9]|[1-9]\d)$/.test(verb ?? '') && !rest.length) {
  const build = join(planDir, 'build');
  const files = existsSync(build) ? readdirSync(build).filter((name) => name.startsWith(`${verb}-`) && name.endsWith('.md')) : [];
  if (files.length !== 1) refuse(`Fragment ${verb} has ${files.length || 'no'} build/${verb}-<slug>.md files. ${USAGE}`);
  if (lines.at(-1)?.kind === verb) refuse(`The work on fragment ${verb} is already the open segment of review/times.log.`);
  const slug = files[0].slice(3, -3);
  const heading = readFileSync(join(build, files[0]), 'utf8').split('\n').find((line) => /^#\s/.test(line)) ?? '';
  append(verb, heading.replace(/^#\s+/, '').replace(new RegExp(`^${verb}(?!\\w)[\\s\\W]*`), '').replace(/\s+/g, ' ').trim() || slug);
} else if (verb === 'wait' && rest.length === 1 && rest[0].trim() && !/[\t\r\n]/.test(rest[0])) {
  append('wait', rest[0].trim());
} else if (verb === 'table' && !rest.length) {
  table();
} else {
  refuse(USAGE);
}
