#!/usr/bin/env node
// Enforces the staging rule of 27-version-control.md by its effect, for bulk
// staging the command text hides, such as git run from another program. With
// --before, as a PreToolUse hook on the shell tool, it records under .temp/ the
// staged paths and HEAD for that tool call, unless bulk-staging.mjs already
// rejects the command; with --after, as a PostToolUse hook, it compares and
// keeps the record, marked finished, for a day. Paths the call staged that no
// command it runs names, by path, directory, or git pathspec pattern, are
// reported with exit status 2, which both clients feed back to the model, with
// the command that unstages them; so is a commit the call made, as the reflog
// records it, with paths it neither named nor had staged before, reported
// without being undone. Paths named by a call that overlapped this one count
// as named: one still running that started within RUNNING, or one that
// finished after this one started. git stash, merges, rebases, cherry-picks,
// and reverts in progress, and HEAD moves other than commits are not judged.

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { isBulk } from './bulk-staging.mjs';
import { enterRepositoryRoot, git, readHookInput, toPosix } from './hook-support.mjs';
import { GIT, gitSubcommand, walk } from './staging-reader.mjs';

const RECORDS = join('.temp', 'check-staging-effect');
const LIFETIME = 24 * 60 * 60 * 1000;
const RUNNING = 60 * 60 * 1000;
const IN_PROGRESS = ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply'];

const input = await readHookInput();
const found = enterRepositoryRoot();
if (!found) process.exit(0);
const real = (path) => (existsSync(path) ? realpathSync.native(path) : path);
const root = real(found);
const cwd = real(typeof input?.cwd === 'string' ? resolve(input.cwd) : found);
const id = String(input?.tool_use_id ?? input?.session_id ?? '').replace(/[^\w-]/g, '_');
if (!id) process.exit(0);
const record = join(RECORDS, `${id}.json`);
const command = input?.tool_input?.command ?? '';
const staged = () => (git(['diff', '--cached', '--name-only', '-z']) ?? '').split('\0').filter(Boolean);
const head = () => git(['rev-parse', '-q', '--verify', 'HEAD'])?.trim() ?? null;
const load = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

if (process.argv.includes('--before')) {
  const readings = input?.tool_name === 'PowerShell' ? [true] : process.argv.includes('--powershell') ? [true, false] : [false];
  try {
    if (isBulk(command, { readings, cwd })) process.exit(0);
  } catch {
    process.exit(0);
  }
  mkdirSync(RECORDS, { recursive: true });
  for (const name of readdirSync(RECORDS)) {
    if (Date.now() - statSync(join(RECORDS, name)).mtimeMs > LIFETIME) unlinkSync(join(RECORDS, name));
  }
  writeFileSync(record, JSON.stringify({ command, cwd, staged: staged(), head: head(), started: Date.now() }));
  process.exit(0);
}
const before = existsSync(record) ? load(record) : null;
if (!before || before.ended) process.exit(0);
writeFileSync(record, JSON.stringify({ ...before, ended: Date.now() }));

// Words of every command a call runs, in POSIX and PowerShell readings, and
// whether any of them is git stash.
function read(call) {
  const words = [];
  let stash = false;
  const visit = ({ name, args }) => {
    words.push(name);
    for (const arg of args) words.push(arg);
    if (GIT.test(name) && args[gitSubcommand(args).index] === 'stash') stash = true;
    return false;
  };
  for (const powershell of [false, true]) {
    try {
      walk(call.command, { powershell, cwd: call.cwd, visit });
    } catch {}
  }
  return { dir: call.cwd, words, stash };
}

// Whether a repository-relative path is named by a word of a command run in dir,
// with git pathspec patterns, where * and ? also match /.
function named(path, word, dir) {
  const target = toPosix(relative(root, resolve(dir, word.replace(/^--pathspec-from-file=/, '')))).replace(/\/$/, '');
  if (!target || target.startsWith('..') || isAbsolute(target)) return false;
  if (path === target || path.startsWith(`${target}/`)) return true;
  if (!/[*?[]/.test(target)) return false;
  const escaped = target.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*\*\//g, '\0').replace(/\*+/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped.replace(/\0/g, '(?:.*/)?')}$`).test(path);
}

const others = readdirSync(RECORDS)
  .filter((name) => name !== `${id}.json`)
  .map((name) => load(join(RECORDS, name)))
  .filter((call) => call && (call.ended ? call.ended >= before.started : Date.now() - call.started < RUNNING));
const calls = [before, ...others].map(read);
const unnamed = (paths) => paths.filter((path) => !calls.some((call) => call.words.some((word) => named(path, word, call.dir))));

const gitDir = git(['rev-parse', '--git-dir'])?.trim() ?? '.git';
if (calls[0].stash || IN_PROGRESS.some((name) => existsSync(join(gitDir, name)))) process.exit(0);
const after = head();
const problems = [];
if (after === before.head) {
  const added = unnamed(staged().filter((path) => !before.staged.includes(path)));
  if (added.length > 0) problems.push(`staged paths it does not name: ${added.join(', ')}. Unstage them with git restore --staged -- <path>`);
} else if (after) {
  // Only commits, as the reflog records every HEAD move since the call began.
  const moves = (git(['reflog', '--format=%H%x09%gs', '-n', '50', 'HEAD']) ?? '').split('\n').filter(Boolean).map((line) => line.split('\t'));
  const since = moves.findIndex(([hash], index) => index > 0 && hash === before.head);
  const range = before.head ? moves.slice(0, since) : moves.filter(([, subject]) => subject.startsWith('commit (initial)'));
  const commitsOnly = (since !== -1 || !before.head) && range.length > 0 && range.every(([, subject]) => /^commit( \((?:amend|initial)\))?:/.test(subject));
  const base = before.head ?? git(['hash-object', '-t', 'tree', '--stdin'], '')?.trim();
  if (commitsOnly && base) {
    const committed = (git(['diff', '--name-only', '-z', base, after]) ?? '').split('\0').filter(Boolean);
    const added = unnamed(committed.filter((path) => !before.staged.includes(path)));
    if (added.length > 0) problems.push(`committed ${after.slice(0, 7)} with paths it neither names nor had staged: ${added.join(', ')}. Report the commit; do not rewrite it without authorization`);
  }
}
if (problems.length > 0) {
  console.error(`27-version-control.md: this command ${problems.join('; it also ')}. Stage the authorized change by explicit paths.`);
  process.exit(2);
}
