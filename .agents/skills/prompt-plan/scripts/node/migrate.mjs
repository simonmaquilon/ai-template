// Upgrade a selected 6.2.0 plan after its writers have stopped. An interrupted copy can be retried because
// each file must match either the original bundle or the complete replacement before any copy begins.
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const LEGACY = {
  'check/all.mjs': ['check-all.mjs', '00dad88d9430516c87502e54203186abeeb20df599b9038e7dd38c54daee5330'],
  'check/evidence.mjs': ['check-evidence.mjs', '24faf4111306de56e84c240461665fa4ff2f797bf924c6c2549032ac5eaf1836'],
  'check/lib.mjs': ['check-lib.mjs', '9ca5d7deff33c1d343a1283e3e22b16f6acd6358865c8bd1c5e74fc2cb78e357'],
  'check/time.mjs': ['check-time.mjs', '74ce3e8b7f919abb36358c5ff1da65326b8acd36bf5ac9d2d3213ce3518e2996'],
  'patch/apply.mjs': ['apply.mjs', 'a46fa1fd533414f5931c2769ed1ecf2e9efe3ac57f3ece31661ec0e7cf5d6e66'],
  'patch/common.mjs': ['common.mjs', '577a3ea24b3b38f9257cb6e9a1bcd490c3df5911f52ab118d8aac20dfd08570f'],
  'patch/record.mjs': ['record.mjs', 'c75ed8b21d87c0593d37c6ff7ce6b9b0fd863f05ad78b41cd956bcbcf1452673'],
  'patch/revert.mjs': ['revert.mjs', '416426fc23b0532ffbf0f4fadb0356ad313fc5a241105781968d17c95500423c'],
};
const ADDED = {
  'check/report.mjs': ['check-report.mjs'],
  'check/state.mjs': ['check-state.mjs'],
  'check/validation.mjs': ['check-validation.mjs'],
};

function regular(path) {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) return null;
  if (!stat.isFile()) throw new Error(`Expected a regular file: ${path}`);
  return readFileSync(path);
}

function atomic(path, original, replacement) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, replacement, { flag: 'wx' });
    const current = regular(path);
    if (original ? !current?.equals(original) : current !== null) throw new Error(`File changed during migration: ${path}`);
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}

function migrate(location, extra) {
  const local = location?.replaceAll('\\', '/');
  if (extra || !/^\.temp\/plans\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(local)) {
    throw new Error('Usage from the project root: node .agents/skills/prompt-plan/scripts/node/migrate.mjs .temp/plans/plan-name');
  }
  const git = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (git.status !== 0 || realpathSync(git.stdout.trim()) !== realpathSync('.')) throw new Error('Start from the project root.');
  const ignored = spawnSync('git', ['check-ignore', '-q', '--', local]);
  if (ignored.status !== 0) throw new Error('The plan directory must be ignored by Git.');
  const plan = resolve(realpathSync('.'), local);
  const hasPatch = lstatSync(join(plan, 'patch'), { throwIfNoEntry: false }) !== undefined;
  for (const part of ['', 'build', 'review', 'check', ...(hasPatch ? ['patch'] : [])]) {
    const dir = join(plan, part);
    if (realpathSync(dir) !== dir || !lstatSync(dir).isDirectory()) throw new Error(`Unsafe plan directory: ${dir}`);
  }
  const index = regular(join(plan, 'build', '00-index.md'))?.toString() ?? '';
  const states = [...index.matchAll(/^\s*\|[^|]*\]\((?:\.\/)?\d{2}-[^)/]*\.md\).*\|[ \t]*`?(pending|failed|blocked|done)`?[ \t]*\|[ \t]*\r?$/gm)];
  const reportPath = join(plan, 'review', 'report.md');
  const report = regular(reportPath);
  if (!states.length) throw new Error('Cannot identify the fragments of this plan.');
  if (states.every((row) => row[1] === 'done')) {
    throw new Error('A completed plan keeps its original scripts and time tables.');
  }
  const helpers = Object.entries({ ...LEGACY, ...ADDED }).flatMap(([name, [bundled, legacy]]) => {
    if (!hasPatch && name.startsWith('patch/')) return [];
    const path = join(plan, name);
    const contents = readFileSync(new URL(bundled, import.meta.url));
    const original = regular(path);
    if (original?.equals(contents)) return [];
    if (original ? createHash('sha256').update(original).digest('hex') !== legacy : legacy !== undefined) {
      throw new Error(`Missing or customized helper: ${name}. No helper was replaced.`);
    }
    return [{ path, original, contents }];
  });
  const refreshed = report?.toString().replace(/^(\s*(?:[-*+]\s+)?)(?:✅|❌)([^\r\n]*\b\d{2}-check-[^\s`]+\.log[^\r\n]*)$/gm,
    '$1⏳$2 (rerun on the current tree)');
  for (const entry of helpers) atomic(entry.path, entry.original, entry.contents);
  if (report && refreshed !== report.toString()) atomic(reportPath, report, refreshed);
  console.log('Migrated active plan. Validate its pending fragments and run node check/all.mjs --final from the plan once the tree is ready.');
}

try {
  migrate(...process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
