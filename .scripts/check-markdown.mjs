#!/usr/bin/env node
// Markdown structure warnings from markdown-rules.mjs (10-documents.md). With --hook it is a non-blocking PostToolUse
// hook: it lints the Git-visible .md files an edit or patch names within this repository, omitting ignored, generated,
// vendored and binary files, and reports through additionalContext only the warnings on lines that differ from HEAD,
// every line of an untracked file; it always exits 0 and writes nothing to stderr. Run by hand, `node
// .scripts/check-markdown.mjs <files>` lints whole files without filters and exits 1 when it printed a warning, 2
// without arguments or when a file could not be read, and 0 otherwise; `--all` lints instead, from any folder, every
// regular .md file Git lists whose real path stays inside the repository and that no attribute marks vendored or
// generated, and also exits 2 outside a repository or without git.

import { spawnSync } from 'node:child_process';
import { closeSync, constants, fstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { changedLines, enterRepositoryRoot, git, readHookInput, toPosix } from './hook-support.mjs';
import { marked, repositoryMarkdown } from './markdown-files.mjs';
import { markdownWarnings } from './markdown-rules.mjs';

const MAX_BYTES = 1024 * 1024;
const MAX_LINES = 20;
const PREFIX = 'Markdown structure (10-documents.md): ';
// A path as printed: control characters, line separators and characters that change text direction escaped, so that a
// file name cannot split, forge or reorder a report line.
const shown = (path) => JSON.stringify(toPosix(path)).slice(1, -1)
  .replace(/[\p{Cc}\p{Bidi_Control}\u2028\u2029]/gu, (char) => `\\u${char.codePointAt(0).toString(16).padStart(4, '0')}`);
const format = (path, warning) => `${path}:${warning.line} [${warning.id}] ${warning.message}`;

if (!process.argv.includes('--hook')) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Usage: node .scripts/check-markdown.mjs --all | <file>...');
    process.exit(2);
  }
  let warned = false, unreadable = false;
  for (const file of files.length === 1 && files[0] === '--all' ? repositoryMarkdown() : files) {
    const label = shown(file);
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch (error) {
      console.error(`${label}: not checked; ${error.code ?? error.message}`);
      unreadable = true;
      continue;
    }
    for (const warning of markdownWarnings(text)) {
      console.log(format(label, warning));
      warned = true;
    }
  }
  process.exit(warned ? 1 : unreadable ? 2 : 0);
}

function emitContext(message) {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `${PREFIX}${message}` },
  }));
  process.exit(0);
}

// The bytes of a regular file, undefined for anything else, or why it was not read; a FIFO never blocks the read.
function readCapped(full) {
  let fd;
  try {
    fd = openSync(full, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0));
    if (!fstatSync(fd).isFile()) return undefined;
    const data = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    for (let read = 1; read > 0 && length < data.length; length += read) {
      read = readSync(fd, data, length, data.length - length, null);
    }
    return length > MAX_BYTES ? 'size limit exceeded' : data.subarray(0, length);
  } catch {
    return 'file unavailable';
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

const input = await readHookInput();
const origin = typeof input.cwd === 'string' ? resolve(input.cwd) : process.cwd();
const root = enterRepositoryRoot();
if (!root) process.exit(0);
const tool = input.tool_input ?? {};
const rawPatch = tool.command ?? tool.input ?? tool.patch;
const patch = Array.isArray(rawPatch) ? rawPatch.join('\n') : typeof rawPatch === 'string' ? rawPatch : '';
const paths = typeof tool.file_path === 'string' ? [tool.file_path]
  : [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Move to): (.+)$/gm)].map((match) => match[1].trim());
if (paths.length === 0) process.exit(0);
let canonicalRoot;
try {
  canonicalRoot = realpathSync.native(root);
} catch {
  emitContext('edit not checked; repository path unavailable.');
}
const visible = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
const others = git(['ls-files', '--others', '--exclude-standard', '-z']);
if (visible === null || others === null) emitContext('edit not checked; repository file inventory unavailable.');
const indexed = new Set(visible.split('\0').filter(Boolean));
const candidates = new Map();
for (const path of paths) {
  let full = null;
  let local;
  try {
    full = realpathSync.native(resolve(origin, path));
    local = toPosix(relative(canonicalRoot, full));
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) continue;
    local = toPosix(relative(root, resolve(origin, path)));
  }
  if (!local || local.startsWith('../') || isAbsolute(local)) continue;
  if (indexed.has(local) && extname(local).toLowerCase() === '.md') candidates.set(local, full);
}
if (candidates.size === 0) process.exit(0);
const ignored = spawnSync('git', ['check-ignore', '--no-index', '-z', '--stdin'], {
  input: [...candidates.keys()].join('\0'), encoding: 'utf8', maxBuffer: 1024 * 1024,
});
if (ignored.status !== 0 && ignored.status !== 1) emitContext('edit not checked; ignore rules unavailable.');
for (const path of ignored.stdout.split('\0')) candidates.delete(path);
if (candidates.size === 0) process.exit(0);
const skipped = marked([...candidates.keys()]);
if (!skipped) emitContext('edit not checked; file attributes unavailable.');
for (const path of skipped) candidates.delete(path);

const untracked = new Set(others.split('\0').filter(Boolean));
const report = [];
for (const [local, full] of candidates) {
  const label = shown(local);
  // A path that realpath could not resolve is null, which openSync rejects.
  const bytes = readCapped(full);
  if (typeof bytes === 'string') report.push(`${label}: not checked; ${bytes}.`);
  if (!Buffer.isBuffer(bytes) || bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  const changed = changedLines(local, untracked);
  // The engine reports trailing blank lines on the line after a final newline, which no diff hunk names.
  const last = text.split('\n').length - 1;
  if (changed?.has(last) && text.endsWith('\n')) changed.add(last + 1);
  for (const warning of markdownWarnings(text)) {
    if (!changed || changed.has(warning.line)) report.push(format(label, warning));
  }
}
if (report.length === 0) process.exit(0);
const hidden = report.length > MAX_LINES ? [`${report.length - MAX_LINES} more warnings not shown; `
  + '`node .scripts/check-markdown.mjs <file>` lists every warning in a file.'] : [];
emitContext(`fix the listed warnings on the lines the change touched.\n${[...report.slice(0, MAX_LINES), ...hidden].join('\n')}`);
