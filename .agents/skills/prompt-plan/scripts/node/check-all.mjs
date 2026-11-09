// Runs, in order, the checks of every fragment up to the one given (or all): node all.mjs [NN] [--slow]
// Copied to check/all.mjs; exits non-zero when any check fails. It runs only NN-check scripts: never an NN-measure
// script, whose run is a fragment's measurement, nor a helpers module the scripts import. Given NN without --slow,
// the checks of earlier fragments skip their slow lines; without NN, every line runs. A command a check runs through
// lib's runOnce is reused within this run once it succeeds, and the shared results are removed when the run ends.
// Pass cache: given NN without --slow, an earlier fragment's check is skipped, printing PASS (cached: <log path>), when
// its last passing run, kept in .cache/pass/, had the same key, taken right before the check runs or is skipped: a hash
// of every file in check/, git rev-parse HEAD; git diff HEAD --binary and the paths and contents of the untracked files
// that are not ignored; a digest of git for-each-ref; and the sorted names in review/, leaving out the run logs, which
// every run adds. Only a passing run is stored, and only when it ended with status 0 and wrote its log. The cache is
// never used with --slow, for all without NN, for fragment NN itself, when the script, or a file of check/ other than
// the NN-check and NN-measure scripts and the bundled lib, all, and evidence, calls lib's volatile( on a line that
// reads state outside the tree, or when git cannot give the key, as with an untracked nested repository or a tracked
// one with changes of its own. lib's volatile lists what the key cannot see.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewDir, root } from './lib.mjs';

const checkDir = dirname(fileURLToPath(import.meta.url));
const onceDir = join(dirname(checkDir), '.cache', 'once');
const passDir = join(dirname(checkDir), '.cache', 'pass');
const DAY = 24 * 60 * 60 * 1000;
const slow = process.argv.includes('--slow');
const rest = process.argv.slice(2).filter((arg) => arg !== '--slow');
const arg = rest[0];
// Anything but a fragment number from 1, such as --baseline or 00, would compare as text and silently run no check.
if (rest.length > 1 || (arg !== undefined && !/^(0?[1-9]|[1-9]\d)$/.test(arg))) {
  console.error('Usage: node all.mjs [NN] [--slow]. Run a single NN-check or NN-measure script directly for a --baseline or --dry-run run.');
  process.exit(2);
}
const upTo = arg ? arg.padStart(2, '0') : '99';
const run = new Date().toISOString().replace(/[:.]/g, '-');
// Removes the shared results that keep rejects.
const removeShared = (keep) => {
  if (!existsSync(onceDir)) return;
  for (const name of readdirSync(onceDir).filter((file) => !keep(file))) rmSync(join(onceDir, name), { force: true });
};
// At start-up, the shared results of runs that ended without reaching their cleanup, such as killed ones, go once a
// day old; a file another run removes meanwhile counts as recent, so it is left alone.
removeShared((file) => Date.now() - (statSync(join(onceDir, file), { throwIfNoEntry: false })?.mtimeMs ?? Date.now()) < DAY);
const digest = (...parts) => parts.reduce((hash, part) => hash.update(`${part.length}:`).update(part), createHash('sha256')).digest('hex');
const git = (args) => {
  const result = spawnSync('git', args, { cwd: root, maxBuffer: 1024 ** 3 });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed`);
  return result.stdout;
};
// What the repository holds: HEAD, every change to tracked files, the untracked files that are not ignored, and the
// refs; null when git cannot say, which no cache then covers. The diff runs without the external diff and textconv
// drivers and the submodule settings that a configuration can set, which would hide a change from it.
const repoDigest = () => {
  try {
    const parts = [git(['rev-parse', 'HEAD']), git(['diff', 'HEAD', '--binary', '--no-ext-diff', '--no-textconv', '--ignore-submodules=none']), digest(git(['for-each-ref']))];
    // A tracked nested repository with changes of its own shows in the diff only as dirty, so the key cannot tell them apart.
    for (const entry of git(['ls-files', '--stage', '-z']).toString().split('\0').filter((line) => line.startsWith('160000 '))) {
      const path = entry.slice(entry.indexOf('\t') + 1);
      if (existsSync(join(root, path, '.git')) && spawnSync('git', ['-C', path, '--no-optional-locks', 'status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout !== '') throw new Error(`${path} has changes`);
    }
    for (const name of git(['ls-files', '--others', '--exclude-standard', '-z']).toString().split('\0').filter(Boolean).sort()) {
      const stat = lstatSync(join(root, name));
      // A folder here is a nested repository, whose contents this key cannot read.
      if (stat.isDirectory()) throw new Error(`${name} is a folder`);
      parts.push(name, stat.isSymbolicLink() ? readlinkSync(join(root, name)) : readFileSync(join(root, name)));
    }
    return digest(...parts);
  } catch {
    return null;
  }
};
const REVIEW_LOG = /^\d{2}-(?:check|measure|baseline|dry-run)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.log$/;
const reviewNames = () => (existsSync(reviewDir) ? readdirSync(reviewDir) : []);
// The files of check/ and of its folders, by path, except run logs.
const files = (folder = '') => readdirSync(join(checkDir, folder), { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? files(join(folder, entry.name)) : REVIEW_LOG.test(entry.name) ? [] : [join(folder, entry.name)])).sort();
// The key of a script's pass, or null when a file that may feed it calls volatile( or the repository cannot be read.
const passKey = (script) => {
  const all = files().map((name) => [name, readFileSync(join(checkDir, name), 'utf8')]);
  const feeds = all.filter(([name]) => name === script || !/^(?:\d{2}-(?:check|measure)|lib|all|evidence)\.mjs$/.test(name));
  if (feeds.some(([, text]) => /\bvolatile\s*\(/.test(text))) return null;
  const state = repoDigest();
  return state && digest(script, state, reviewNames().filter((name) => !REVIEW_LOG.test(name)).sort().join('\n'), ...all.flat());
};
let failed = false;
try {
  for (const script of readdirSync(checkDir).filter((name) => /^\d{2}-check\.mjs$/.test(name) && name.slice(0, 2) <= upTo).sort()) {
    const number = script.slice(0, 2);
    const earlier = arg !== undefined && !slow && number < upTo;
    const key = passKey(script);
    const passFile = join(passDir, `${number}.json`);
    if (earlier && key) {
      let saved;
      try {
        saved = JSON.parse(readFileSync(passFile, 'utf8'));
      } catch {
        // No pass stored yet, or one a killed run left half written.
      }
      if (saved?.key === key && existsSync(join(root, saved.log))) {
        console.log(`Fragment ${number}: PASS (cached: ${saved.log})`);
        continue;
      }
    }
    const known = new Set(reviewNames());
    const env = { ...process.env, PROMPT_PLAN_RUN: run, PROMPT_PLAN_SKIP_SLOW: earlier ? '1' : '0' };
    const status = spawnSync(process.execPath, [join(checkDir, script)], { stdio: 'inherit', env }).status;
    if (status !== 0) failed = true;
    // Only a run that exited with status 0 and wrote its log is a pass to keep, under the key it started with.
    const log = reviewNames().filter((name) => !known.has(name) && name.startsWith(`${number}-check-`) && REVIEW_LOG.test(name)).sort().at(-1);
    if (status === 0 && key && log) {
      mkdirSync(passDir, { recursive: true });
      writeFileSync(passFile, JSON.stringify({ key, log: relative(root, join(reviewDir, log)) }));
    }
  }
} finally {
  removeShared((file) => !file.startsWith(`${run}-`));
}
process.exit(failed ? 1 : 0);
