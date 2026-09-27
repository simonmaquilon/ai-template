#!/usr/bin/env node
// Enforces the staging rule of 27-version-control.md by its effect, for bulk
// staging the command text hides, such as git run from another program. With
// --before, as a PreToolUse hook on the shell tool, it records under .temp/ what
// the index holds and HEAD for that tool call; with --after, as a PostToolUse
// hook, it compares. Paths the call staged that its command does not name, by
// path, directory, or pattern, directly or through what check-staging.mjs reads
// behind aliases, script files, and make targets, are reported with exit
// status 2, which both clients feed back to the model, with the command that
// unstages them; so is a commit the call made with paths it neither named nor
// had staged before, which is reported without being undone. Paths named by
// another call still running count as named. A merge, rebase, cherry-pick, or
// revert in progress, and any other move of HEAD, such as a reset, a pull, or
// a checkout, are not judged. Records older than a day are dropped.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { aliasScripts, fileScripts, makeScripts } from './hidden-commands.mjs';
import { enterRepositoryRoot, git, readHookInput, toPosix } from './hook-support.mjs';
import { commands } from './shell-commands.mjs';

const RECORDS = join('.temp', 'check-staging-effect');
const LIFETIME = 24 * 60 * 60 * 1000;
const IN_PROGRESS = ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply'];

const input = await readHookInput();
const root = enterRepositoryRoot();
if (!root) process.exit(0);
const cwd = typeof input?.cwd === 'string' ? resolve(input.cwd) : root;
const id = String(input?.tool_use_id ?? input?.session_id ?? '').replace(/[^\w-]/g, '_');
if (!id) process.exit(0);
const record = join(RECORDS, `${id}.json`);
const staged = () => (git(['diff', '--cached', '--name-only', '-z']) ?? '').split('\0').filter(Boolean);
const head = () => git(['rev-parse', '-q', '--verify', 'HEAD'])?.trim() ?? null;
const readRecord = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

if (process.argv.includes('--before')) {
  mkdirSync(RECORDS, { recursive: true });
  for (const name of readdirSync(RECORDS)) {
    const path = join(RECORDS, name);
    if (Date.now() - statSync(path).mtimeMs > LIFETIME) unlinkSync(path);
  }
  writeFileSync(record, JSON.stringify({ command: input?.tool_input?.command ?? '', cwd, staged: staged(), head: head() }));
  process.exit(0);
}
if (!existsSync(record)) process.exit(0);
const before = readRecord(record);
unlinkSync(record);
if (!before) process.exit(0);

// Words of a command and of what it runs through aliases, files, and make,
// in both POSIX and PowerShell readings.
function words(script, dir, depth = 0) {
  if (depth > 8) return [];
  const found = [];
  for (const powershell of [false, true]) {
    for (const { words: parts } of commands(script, { powershell })) {
      found.push(...parts);
      const [name, ...args] = parts;
      const hidden = /(?:^|[\\/])git(?:\.exe)?$/i.test(name ?? '')
        ? aliasScripts([], args.find((arg) => !arg.startsWith('-')), args.slice(1), dir)
        : name === 'make' ? makeScripts(args, dir) : fileScripts(name === 'bash' || name === 'sh' ? 'source' : name ?? '', args, dir);
      for (const { script: inner } of hidden) found.push(...words(inner, dir, depth + 1));
    }
  }
  return found;
}

// Whether a repository-relative path is named by a word of a command run in dir.
function named(path, word, dir) {
  const target = toPosix(relative(root, resolve(dir, word.replace(/^--pathspec-from-file=/, '')))).replace(/\/$/, '');
  if (!target || target.startsWith('..') || isAbsolute(target)) return false;
  if (path === target || path.startsWith(`${target}/`)) return true;
  const pattern = target.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\0/g, '.*');
  return /[*?]/.test(target) && new RegExp(`^${pattern}$`).test(path);
}

const others = existsSync(RECORDS) ? readdirSync(RECORDS).map((name) => readRecord(join(RECORDS, name))).filter(Boolean) : [];
const calls = [before, ...others].map((call) => ({ dir: call.cwd, words: words(Array.isArray(call.command) ? call.command.join(' ') : String(call.command), call.cwd) }));
const unnamed = (paths) => paths.filter((path) => !calls.some((call) => call.words.some((word) => named(path, word, call.dir))));

const gitDir = git(['rev-parse', '--git-dir'])?.trim() ?? '.git';
if (IN_PROGRESS.some((name) => existsSync(join(gitDir, name)))) process.exit(0);
const after = head();
const problems = [];
if (after === before.head) {
  const added = unnamed(staged().filter((path) => !before.staged.includes(path)));
  if (added.length > 0) problems.push(`staged paths it does not name: ${added.join(', ')}. Unstage them with git restore --staged -- <path>`);
} else if (after) {
  // A new commit on top of the previous HEAD, an amend of it, or a first commit.
  const parent = git(['rev-parse', '-q', '--verify', `${after}^`])?.trim() ?? null;
  const amended = before.head && parent === (git(['rev-parse', '-q', '--verify', `${before.head}^`])?.trim() ?? null);
  const base = parent === before.head ? parent : amended ? before.head : undefined;
  const list = base === null ? ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', after] : ['diff', '--name-only', '-z', base, after];
  const committed = base === undefined ? [] : (git(list) ?? '').split('\0').filter(Boolean);
  const added = unnamed(committed.filter((path) => !before.staged.includes(path)));
  if (added.length > 0) problems.push(`committed ${after.slice(0, 7)} with paths it neither names nor had staged: ${added.join(', ')}. Report the commit; do not rewrite it without authorization`);
}
if (problems.length > 0) {
  console.error(`27-version-control.md: this command ${problems.join('; it also ')}. Stage the authorized change by explicit paths.`);
  process.exit(2);
}
