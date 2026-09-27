#!/usr/bin/env node
// Enforces the source-file size limit of 14-code-authoring.md on the files that
// source-files.mjs counts as source. With --hook it reads the agent client's
// hook input: after an edit it checks the files that edit touched, and when a
// turn stops it checks the files changed against HEAD, untracked ones included,
// that changed after the session's turn marker; with --turn-start it only
// writes that marker under .temp/. Run by hand it checks every file changed
// against HEAD, or against the revision --base names, which continuous
// integration passes because its fresh checkout has no local changes; when git
// cannot resolve that revision, as with a previous head a force push left out
// of the checkout, it warns and uses the parent of HEAD, or the empty tree when
// HEAD has none. A file may hold at most LIMIT lines, and one already over the
// limit at that revision may change but must not grow. Violations go to stderr
// with exit status 2, which both clients feed back to the model; a stop that
// any Stop hook already continued, or a directory outside git, passes silently.

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { enterRepositoryRoot, git, readHookInput, toPosix } from './hook-support.mjs';
import { exemptPaths, isSource } from './source-files.mjs';

const LIMIT = 150;
const PATCH_HEADER = /^\*\*\* (Add File|Update File|Move to): (.+)$/;
const MARKERS = '.temp/check-file-length';
const MARKER_LIFETIME = 7 * 24 * 60 * 60 * 1000;

// Paths an edit touched, as [path, previous path] pairs: an edit tool names one
// file, and a patch names each file it adds, updates, or moves.
function touchedPaths(toolInput) {
  if (typeof toolInput.file_path === 'string') return [[toolInput.file_path, null]];
  const command = Array.isArray(toolInput.command) ? toolInput.command.join('\n') : String(toolInput.command ?? '');
  const paths = [];
  for (const line of command.split('\n')) {
    const match = PATCH_HEADER.exec(line.trim());
    if (!match) continue;
    if (match[1] === 'Move to' && paths.length > 0) paths.push([match[2], paths.pop()[0]]);
    else paths.push([match[2], null]);
  }
  return paths;
}

// Files changed against the base revision, as [path, previous path] pairs
// relative to the repository root; when git cannot resolve that revision, as
// before a first commit, every indexed file is new.
function changedPaths() {
  const paths = [];
  const diff = git(['diff', '--name-status', '-M', '-z', revision]);
  const fields = (diff ?? git(['ls-files', '-z']) ?? '').split('\0').filter(Boolean);
  for (let i = 0; i < fields.length; ) {
    if (diff === null) {
      paths.push([fields[i++], null]);
      continue;
    }
    const status = fields[i++];
    if (status.startsWith('R')) paths.push([fields[i + 1], fields[i]]);
    else if (status.startsWith('C')) paths.push([fields[i + 1], null]);
    else if (!status.startsWith('D')) paths.push([fields[i], null]);
    i += status.startsWith('R') || status.startsWith('C') ? 2 : 1;
  }
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']) ?? '';
  for (const path of untracked.split('\0').filter(Boolean)) paths.push([path, null]);
  return paths;
}

function lineCount(text) {
  if (text.length === 0) return 0;
  const lines = text.split('\n').length;
  return text.endsWith('\n') ? lines - 1 : lines;
}

// Records when the session's turn began and drops markers of idle sessions.
function markTurnStart(marker) {
  mkdirSync(MARKERS, { recursive: true });
  writeFileSync(marker, String(Date.now()));
  for (const name of readdirSync(MARKERS)) {
    const path = join(MARKERS, name);
    if (Date.now() - statSync(path).mtimeMs > MARKER_LIFETIME) unlinkSync(path);
  }
}

// Real location of a path, with the case the file system stores; a file that
// does not exist yet keeps its name under its real directory.
function realPath(full) {
  for (const candidate of [() => realpathSync.native(full), () => join(realpathSync.native(dirname(full)), basename(full))]) {
    try {
      return candidate();
    } catch {}
  }
  return full;
}

const input = process.argv.includes('--hook') ? await readHookInput() : {};
const baseFlag = process.argv.indexOf('--base');
let revision = baseFlag === -1 ? 'HEAD' : (process.argv[baseFlag + 1] ?? '');
if (input.stop_hook_active === true) process.exit(0);
const origin = typeof input.cwd === 'string' ? resolve(input.cwd) : process.cwd();
const root = enterRepositoryRoot();
if (!root) process.exit(0);
if (baseFlag !== -1 && git(['rev-parse', '--verify', '--quiet', `${revision}^{commit}`]) === null) {
  const parent = git(['rev-parse', '--verify', '--quiet', 'HEAD^'])?.trim();
  console.error(`check-file-length: --base "${revision}" is not a commit in this repository; ${parent ? 'checking against the parent of HEAD' : 'counting every file as new'} instead.`);
  revision = parent ?? git(['hash-object', '-t', 'tree', '--stdin'], '').trim();
}

const session = String(input.session_id ?? '').replace(/[^\w-]/g, '_');
const marker = session ? join(MARKERS, session) : null;
if (process.argv.includes('--turn-start')) {
  try {
    if (marker) markTurnStart(marker);
  } catch {}
  process.exit(0);
}

// Repository-relative path with forward slashes, judged by its real location so
// that a file reached through a symlinked directory counts where it lives.
const canonicalRoot = realpathSync.native(root);
const inRepository = (path, base) => {
  const local = relative(canonicalRoot, realPath(resolve(base, path)));
  return local && !local.startsWith('..') && !isAbsolute(local) ? toPosix(local) : null;
};
const base = input.tool_input ? origin : root;
const since = !input.tool_input && marker && existsSync(marker) ? statSync(marker).mtimeMs : null;
const candidates = (input.tool_input ? touchedPaths(input.tool_input) : changedPaths())
  .map(([path, previous]) => [inRepository(path, base), previous && inRepository(previous, base)])
  .filter(([path]) => path && isSource(path) && existsSync(path) && statSync(path).isFile())
  .filter(([path]) => since === null || statSync(path).mtimeMs > since);
const exempt = candidates.length > 0 ? exemptPaths(candidates.map(([path]) => path), git) : new Set();

const violations = [];
for (const [path, previous] of candidates) {
  if (exempt.has(path)) continue;
  const content = readFileSync(path);
  if (content.subarray(0, 8000).includes(0)) continue;
  const lines = lineCount(content.toString('utf8'));
  if (lines <= LIMIT) continue;
  const before = git(['show', `${revision}:${previous ?? path}`]);
  const baseline = before === null ? null : lineCount(before);
  if (baseline !== null && baseline > LIMIT && lines <= baseline) continue;
  violations.push(`${path} (${lines} lines${baseline === null ? ', new' : `, was ${baseline}`})`);
}

if (violations.length > 0) {
  console.error(
    `Source files over ${LIMIT} lines (14-code-authoring.md): ${[...new Set(violations)].join('; ')}. ` +
      'Split each along responsibility boundaries now; a file already over the limit may change but must not grow. ' +
      'Fix the files this task changed and report any other as user-owned.',
  );
  process.exit(2);
}
