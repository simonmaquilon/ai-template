// Read-only evidence evaluator for the Stop hook and report refresh command for an executor.
import { randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// In a checked-out template this file imports its checked-in sibling, never plan code.
const bundled = fileURLToPath(import.meta.url).endsWith('check-report.mjs');
const { buildChecks, captureIdentity, CHECK_LOG, HASH, localEntry, readLocal, readLog, requiredChecks, RUN_ID } =
  await import(bundled ? './check-state.mjs' : './state.mjs');

export const FINAL_FILE = 'final-run.json';
const REPORT_FILE = 'review/report.md';
const OUTCOMES = new Set(['PASS', 'FAIL', 'PENDING', 'SKIPPED']);
const CITE = /\[\[run:([^\]\r\n]*)\]\]/g;
const MARK = /^(\s*(?:[-*+]\s+|\d+[.)]\s+)?)(✅|❌|⏳)(\s+)(.*)$/;
const CLAIM_ID = /^(?:\[((?:AC|C|D|R)\d+)\]|((?:AC|C|D|R)\d+)(?=$|[\s.:·)–—-]))/;

export function readRun(planDir, name) {
  if (!CHECK_LOG.test(name)) return null;
  try {
    const preview = readLocal(planDir, `review/${name.replace(/\.log$/, '.json')}`);
    if (!preview) return null;
    const run = JSON.parse(preview.toString('utf8'));
    if (run.version !== 1 || (run.run !== null && !RUN_ID.test(run.run)) || !HASH.test(run.sha256) || !Number.isInteger(run.exit)
      || !Array.isArray(run.checks) || !run.checks.length
      || !run.checks.every((check) => typeof check?.id === 'string' && OUTCOMES.has(check.status))) return null;
    const log = readLog(planDir, `review/${name}`);
    if (!log || log.sha256 !== run.sha256 || !log.tail.toString('utf8').endsWith(`\n## EXIT ${run.exit}\n`)) return null;
    return run;
  } catch {
    return null;
  }
}

const stableRun = (run, current) => current && run?.stateBefore === current && run.stateAfter === current;

export function finalFragmentStatus(checks, exit) {
  if (!checks.length || checks.some(({ status }) => status === 'SKIPPED')) return 'incomplete';
  if (exit !== 0 || checks.some(({ status }) => status === 'FAIL')) return 'failed';
  return 'passed';
}

function supportsClaim(mark, body, cited) {
  if (!cited.length || cited.some((run) => !run || run.status === 'incomplete')) return false;
  const [, bracketed, plain] = CLAIM_ID.exec(body) ?? [];
  const id = bracketed ?? plain;
  if (id) {
    const matches = cited.map(({ checks }) => checks.filter((check) => check.id === id));
    if (matches.some((checks) => !checks.length)) return false;
    const results = matches.flat();
    return mark === '✅' ? results.every(({ status }) => status === 'PASS') : results.some(({ status }) => status === 'FAIL');
  }
  return mark === '✅' ? cited.every(({ status, checks }) => status === 'passed' && checks.length && checks.every((check) => check.status === 'PASS'))
    : cited.some(({ status }) => status === 'failed');
}

function readFinal(planDir, identity, runFor) {
  if (!identity) return null;
  const current = identity.combined;
  try {
    const raw = readLocal(planDir, `review/${FINAL_FILE}`);
    if (!raw) return null;
    const final = JSON.parse(raw.toString('utf8'));
    const matches = (saved) => saved && Object.keys(identity).every((field) => saved[field] === identity[field]);
    if (final.version !== 1 || !RUN_ID.test(final.run ?? '') || !['passed', 'failed'].includes(final.status)
      || !matches(final.state?.before) || !matches(final.state?.after)
      || final.before !== current || final.after !== current || !Array.isArray(final.fragments)) return null;
    const inventory = requiredChecks(planDir).map((name) => name.slice(0, 2));
    if (!inventory.length || JSON.stringify(inventory) !== JSON.stringify(final.fragments.map(({ number }) => number))) return null;
    const logs = new Set();
    const checks = [];
    const statuses = [];
    for (const { number, status, logs: fragmentLogs } of final.fragments) {
      if (!['passed', 'failed'].includes(status) || !Array.isArray(fragmentLogs) || !fragmentLogs.length) return null;
      statuses.push(status);
      const fragmentChecks = [];
      let exit;
      for (const log of fragmentLogs) {
        if (typeof log?.name !== 'string' || !log.name.startsWith(`${number}-`) || logs.has(log.name) || !HASH.test(log.sha256 ?? '')) return null;
        const run = runFor(log.name);
        if (!stableRun(run, current) || run.run !== final.run || run.sha256 !== log.sha256 || (exit !== undefined && run.exit !== exit)) return null;
        logs.add(log.name);
        exit = run.exit;
        fragmentChecks.push(...run.checks);
      }
      if (status !== finalFragmentStatus(fragmentChecks, exit)) return null;
      checks.push(...fragmentChecks);
    }
    if (final.status !== (statuses.includes('failed') ? 'failed' : 'passed')) return null;
    return { status: final.status, checks };
  } catch {
    return null;
  }
}

function closedFragment(planDir, fragments) {
  const index = readLocal(planDir, 'build/00-index.md')?.toString('utf8') ?? '';
  const done = new Set(index.split(/\r?\n/).filter((line) => /\|\s*`?done`?\s*\|\s*$/.test(line))
    .map((line) => /^\s*\|\s*\[[^\]]+\]\((?:\.\/)?([^)]+)\)/.exec(line)?.[1]));
  return [...fragments.values()].some(({ name, final }) => final && done.has(name));
}

function inspect(root, planDir) {
  const diagnostics = [];
  const info = { active: false, diagnostics, report: '', updated: '', partial: 0 };
  try {
    if (realpathSync.native(planDir) !== resolve(planDir)) throw new Error('Linked plan directory.');
    info.active = Boolean(localEntry(planDir, 'check/report.mjs') || localEntry(planDir, `review/${FINAL_FILE}`));
    if (!info.active) return info;
    const report = readLocal(planDir, REPORT_FILE)?.toString('utf8') ?? '';
    info.report = report;
    info.updated = report;
    const lines = report.split(/(\r?\n)/);
    const fragments = buildChecks(planDir);
    const mustPass = closedFragment(planDir, fragments);
    const identity = mustPass || report.includes('[[run:') ? captureIdentity(root, planDir) : null;
    const current = identity?.combined;
    const checkedRuns = new Map();
    const runFor = (name) => {
      if (!checkedRuns.has(name)) checkedRuns.set(name, readRun(planDir, name));
      return checkedRuns.get(name);
    };
    const final = readFinal(planDir, identity, runFor);
    if (mustPass && final?.status !== 'passed') diagnostics.push('The completed closure needs fresh passing review/final-run.json evidence. Run check/all.mjs --final.');
    info.updated = lines.map((line, index) => {
      const match = MARK.exec(line);
      if (!match) return line;
      const [, prefix, mark, gap, body] = match;
      if (mark === '⏳' && /^\[partial\](?:\s|$)/.test(body)) info.partial += 1;
      const names = [...body.matchAll(CITE)].map((cite) => cite[1]);
      if (mark === '⏳' || !body.includes('[[run:')) return line;
      const cited = names.map((name) => {
        if (name === FINAL_FILE) return final;
        const run = runFor(name);
        if (!stableRun(run, current)) return null;
        return { status: finalFragmentStatus(run.checks, run.exit), checks: run.checks };
      });
      if (supportsClaim(mark, body, cited)) return line;
      diagnostics.push(`review/report.md line ${Math.floor(index / 2) + 1} cites missing, stale or mismatched run evidence. Run check/report.mjs --refresh.`);
      return `${prefix}⏳${gap}${body}`;
    }).join('');
  } catch {
    info.active = true;
    diagnostics.push('Cannot safely read the plan report and run evidence.');
  }
  return info;
}

export function checkStatus(root, planDir) {
  const { active, diagnostics } = inspect(root, planDir);
  return { active, diagnostics };
}

export function writeAtomic(planDir, path, data) {
  const entry = localEntry(planDir, path);
  if (entry && !entry.info.isFile()) throw new Error('Expected a regular evidence file.');
  if (localEntry(planDir, 'review') === null) mkdirSync(join(planDir, 'review'));
  const temp = join(planDir, 'review', `.${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, data, { flag: 'wx' });
    renameSync(temp, join(planDir, path));
  } finally {
    rmSync(temp, { force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && args[0] !== '--refresh')) {
    console.error('Usage: node check/report.mjs [--refresh]');
    process.exit(2);
  }
  const { root, planDir } = await import('./lib.mjs');
  const result = inspect(root, planDir);
  if (args.length && result.report && result.updated !== result.report) writeAtomic(planDir, REPORT_FILE, result.updated);
  for (const issue of result.diagnostics) console.error(issue);
  const source = args.length ? result.updated : result.report;
  console.log(source.trimEnd().replace(/(⏳\s+)\[partial\]\s*/g, '$1Parcial '));
  if (result.partial) console.log(`⏳ Parcial: ${result.partial}`);
}
