// Upgrade a selected plan of 6.2.0, 7.0.0, or 7.0.1 after its writers have stopped. An interrupted copy can be retried
// because each file must match either a known original or the complete replacement before any copy begins.
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Each helper by its bundled name and the SHA-256 of the copies 6.2.0, 7.0.0, and 7.0.1 gave a plan, oldest first: a
// version that left a helper as the one before has no hash of its own, and 6.2.0 has none where it lacked the helper.
const KNOWN = {
  'check/all.mjs': ['check-all.mjs', ['00dad88d9430516c87502e54203186abeeb20df599b9038e7dd38c54daee5330', '05f6229d8ad66beba52545fb5add8753e2cc57acaba356e464a0625e5dae8371', '78097df2fbac31ed3d919b20f057be103444d4bc61f1f4f2267bf2eaf167cbc4']],
  'check/evidence.mjs': ['check-evidence.mjs', ['24faf4111306de56e84c240461665fa4ff2f797bf924c6c2549032ac5eaf1836', '90b8160561a304aef6d76298aa6db6e4b0219ed72e4dda9f94cf56de91d5b486', '5426f9a50ddddd73d9781924f572a37cc60b0b7dbfbe804d14d66bb53455a23e']],
  'check/lib.mjs': ['check-lib.mjs', ['9ca5d7deff33c1d343a1283e3e22b16f6acd6358865c8bd1c5e74fc2cb78e357', 'd462d5a615d1026916f4670e39e04bc54fba653b44bb61ac632f06357982890f', 'ee29dd1ac7ba69b069a76aa9a4fc9b62d769463c29dadaa73c91b8d062cb3ab7']],
  'check/time.mjs': ['check-time.mjs', ['74ce3e8b7f919abb36358c5ff1da65326b8acd36bf5ac9d2d3213ce3518e2996', 'e98352dca8d338623835006f19f70d2fb5d70ff6460cc035043d7fc4cfc8cfbd']],
  'patch/apply.mjs': ['apply.mjs', ['a46fa1fd533414f5931c2769ed1ecf2e9efe3ac57f3ece31661ec0e7cf5d6e66']],
  'patch/common.mjs': ['common.mjs', ['577a3ea24b3b38f9257cb6e9a1bcd490c3df5911f52ab118d8aac20dfd08570f', '2209d482b47c02c6014ba8adb2fa2a642aa5cc0fb34c0f4db38e70469be9a198']],
  'patch/record.mjs': ['record.mjs', ['c75ed8b21d87c0593d37c6ff7ce6b9b0fd863f05ad78b41cd956bcbcf1452673', '1fb0c849d29b44332356b5125e9e181616af53a23240bab418a91fd2fa658974', '54e177d60dfb76616186cd9c9b267e733ed1bf024ea3ee6985e6ded1f2f87bbf']],
  'patch/revert.mjs': ['revert.mjs', ['416426fc23b0532ffbf0f4fadb0356ad313fc5a241105781968d17c95500423c']],
  'check/report.mjs': ['check-report.mjs', ['709c3fff1a58a5e7f70a9595852e55d7509974489fc82501ef9efa991ad67c47']],
  'check/state.mjs': ['check-state.mjs', ['04a3b7a898210309a3bd69613b0a81c6821d54c476f787166b1112bab8987d8d', '3c1280dd6ea944cab0e7379f8c2f69d119ac6b9d3b36a22b7060f3e0455bd7af']],
  'check/validation.mjs': ['check-validation.mjs', ['e66af95e7588bc0da7e0b0eaf53626c8534fbdc572ee04df11ff17f4c584f670']],
};
// The helpers 6.2.0 did not have, which a plan of that version may lack.
const ADDED = new Set(['check/report.mjs', 'check/state.mjs', 'check/validation.mjs']);

function regular(path) {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) return null;
  if (!stat.isFile()) throw new Error(`Expected a regular file: ${path}`);
  return readFileSync(path);
}

// The temporary lives in the plan's .cache/, on the plan's drive so the rename stays atomic, and never among the files of
// check/ or patch/ that the evidence fingerprints, where an abrupt stop would leave it.
function atomic(path, original, replacement, staging) {
  const temp = join(staging, `${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, replacement, { flag: 'wx' });
    const current = regular(path);
    if (original ? !current?.equals(original) : current !== null) throw new Error(`File changed during migration: ${path}`);
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}

// What earlier versions left beside a helper when a run stopped between writing the temporary and renaming it.
const BESIDE = /^[a-z]+\.(?:mjs|md)\.[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.tmp$/;

function clearTemporaries(plan, staging, dirs) {
  rmSync(staging, { recursive: true, force: true });
  for (const dir of dirs) {
    for (const entry of readdirSync(join(plan, dir), { withFileTypes: true })) {
      if (entry.isFile() && BESIDE.test(entry.name)) rmSync(join(plan, dir, entry.name), { force: true });
    }
  }
  mkdirSync(staging, { recursive: true });
}

function migrate(location, extra) {
  const local = location?.replaceAll('\\', '/');
  if (extra || !/^\.temp\/plans\/[A-Za-z0-9][A-Za-z0-9_-]*$/.test(local)) {
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
  const cache = join(plan, '.cache');
  if (lstatSync(cache, { throwIfNoEntry: false })?.isDirectory() === false) throw new Error(`Unsafe plan directory: ${cache}`);
  const index = regular(join(plan, 'build', '00-index.md'))?.toString() ?? '';
  const states = [...index.matchAll(/^\s*\|[^|]*\]\((?:\.\/)?\d{2}-[^)/]*\.md\).*\|[ \t]*`?(pending|failed|blocked|done)`?[ \t]*\|[ \t]*\r?$/gm)];
  const reportPath = join(plan, 'review', 'report.md');
  const report = regular(reportPath);
  if (!states.length) throw new Error('Cannot identify the fragments of this plan.');
  if (states.every((row) => row[1] === 'done')) {
    throw new Error('A completed plan keeps its original scripts and time tables.');
  }
  const helpers = Object.entries(KNOWN).flatMap(([name, [bundled, hashes]]) => {
    if (!hasPatch && name.startsWith('patch/')) return [];
    const path = join(plan, name);
    const contents = readFileSync(new URL(bundled, import.meta.url));
    const original = regular(path);
    if (original?.equals(contents)) return [];
    if (original ? !hashes.includes(createHash('sha256').update(original).digest('hex')) : !ADDED.has(name)) {
      throw new Error(`Missing or customized helper: ${name}. No helper was replaced.`);
    }
    return [{ path, original, contents }];
  });
  const refreshed = report?.toString().replace(/^(\s*(?:[-*+]\s+)?)(?:✅|❌)([^\r\n]*\b\d{2}-check-[^\s`]+\.log[^\r\n]*)$/gm,
    '$1⏳$2 (rerun on the current tree)');
  const staging = join(cache, 'migrate');
  clearTemporaries(plan, staging, ['check', 'review', ...(hasPatch ? ['patch'] : [])]);
  try {
    for (const entry of helpers) atomic(entry.path, entry.original, entry.contents, staging);
    if (report && refreshed !== report.toString()) atomic(reportPath, report, refreshed, staging);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  console.log('Migrated active plan. Validate its pending fragments and run node check/all.mjs --final from the plan once the tree is ready.');
}

try {
  migrate(...process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
