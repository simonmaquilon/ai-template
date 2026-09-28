#!/usr/bin/env node
// Enforces the staging rule of 27-version-control.md by its effect, for bulk
// staging the command text hides, such as git run from another program. With
// --before, as a PreToolUse hook on the shell tool, it records under .temp/ the
// staged paths and HEAD for that tool call, unless bulk-staging.mjs already
// rejects the command; with --after, as a PostToolUse hook, it compares and
// keeps the record, marked finished, for a day. Exit status 2, which both
// clients feed back to the model, reports paths that became staged during the
// call without any of its commands naming them, by path, directory, brace
// expansion, or git pathspec pattern from the directory cd or Set-Location left,
// asking the agent to unstage them only if it staged them; and a commit the
// call made, as the reflog records it, with paths it neither named nor had
// staged, which it reports without undoing. Paths named by an overlapping call,
// one still running that started within RUNNING or one that finished after
// this one started, count as named. Calls that run git commands staging by
// their nature, such as stash, merge, or apply, operations in progress, and
// HEAD moves other than commits are not judged.

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { isBulk } from './bulk-staging.mjs';
import { enterRepositoryRoot, git, readHookInput, toPosix } from './hook-support.mjs';
import { GIT, gitSubcommand, walk } from './staging-reader.mjs';

const RECORDS = join('.temp', 'check-staging-effect');
const LIFETIME = 24 * 60 * 60 * 1000;
const RUNNING = 10 * 60 * 1000;
const SELF_STAGING = new Set(['stash', 'merge', 'cherry-pick', 'revert', 'apply', 'submodule', 'pull', 'rebase', 'am']);
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
    try {
      if (Date.now() - statSync(join(RECORDS, name)).mtimeMs > LIFETIME) unlinkSync(join(RECORDS, name));
    } catch {}
  }
  writeFileSync(record, JSON.stringify({ command, cwd, staged: staged(), head: head(), started: Date.now() }));
  process.exit(0);
}
const before = existsSync(record) ? load(record) : null;
if (!before || before.ended) process.exit(0);
writeFileSync(record, JSON.stringify({ ...before, ended: Date.now() }));

// Brace expansions of a word, such as a/{b,c} into a/b and a/c.
function braces(word) {
  const match = /^(.*?)\{([^{}]*,[^{}]*)\}(.*)$/s.exec(word);
  return match ? match[2].split(',').flatMap((part) => braces(`${match[1]}${part}${match[3]}`)) : [word];
}

// Words of every command a call runs, in POSIX and PowerShell readings, each
// with the directory cd, pushd, or Set-Location left it in, and whether any is
// a git command that stages by its nature, such as stash, merge, or apply.
function read(call) {
  const words = [];
  let staging = false;
  for (const powershell of [false, true]) {
    let dir = call.cwd;
    const visit = ({ name, args }) => {
      if (/^(?:cd|pushd|set-location|sl|chdir)$/i.test(name)) dir = resolve(dir, args.find((arg) => !arg.startsWith('-')) ?? '.');
      for (const word of [name, ...args]) for (const expanded of braces(word)) words.push([expanded, dir]);
      if (GIT.test(name) && SELF_STAGING.has(args[gitSubcommand(args).index])) staging = true;
      return false;
    };
    try {
      walk(call.command, { powershell, cwd: call.cwd, visit });
    } catch {}
  }
  return { words, staging };
}

// Whether a repository-relative path is named by a word of a command run in dir,
// with git pathspec patterns, where * and ? also match / and :/ starts at the
// root; a pattern needs a literal character to name anything.
function named(path, word, dir) {
  const spec = word.replace(/^--pathspec-from-file=/, '');
  const target = toPosix(spec.startsWith(':/') ? spec.slice(2) : relative(root, resolve(dir, spec))).replace(/\/$/, '');
  if (!target || target.startsWith('..') || isAbsolute(target)) return false;
  if (path === target || path.startsWith(`${target}/`)) return true;
  if (!/[*?[]/.test(target) || !/[^*?/[\]]/.test(target)) return false;
  const escaped = target.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*\*\//g, '\0').replace(/\*+/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped.replace(/\0/g, '(?:.*/)?')}$`).test(path);
}

const others = readdirSync(RECORDS)
  .filter((name) => name !== `${id}.json`)
  .map((name) => load(join(RECORDS, name)))
  .filter((call) => call && (call.ended ? call.ended >= before.started : Date.now() - call.started < RUNNING));
const calls = [before, ...others].map(read);
const unnamed = (paths) => paths.filter((path) => !calls.some((call) => call.words.some(([word, dir]) => named(path, word, dir))));

const gitDir = git(['rev-parse', '--git-dir'])?.trim() ?? '.git';
if (calls[0].staging || IN_PROGRESS.some((name) => existsSync(join(gitDir, name)))) process.exit(0);
const after = head();
const problems = [];
let judged = after === before.head;
if (after && !judged) {
  // Only commits, as the reflog records every HEAD move since the call began.
  const moves = (git(['reflog', '--format=%H%x09%gs', '-n', '50', 'HEAD']) ?? '').split('\n').filter(Boolean).map((line) => line.split('\t'));
  const since = moves.findIndex(([hash], index) => index > 0 && hash === before.head);
  const range = before.head ? moves.slice(0, since) : moves.filter(([, subject]) => subject.startsWith('commit (initial)'));
  judged = (since !== -1 || !before.head) && range.length > 0 && range.every(([, subject]) => /^commit( \((?:amend|initial)\))?:/.test(subject));
  const base = before.head ?? git(['hash-object', '-t', 'tree', '--stdin'], '')?.trim();
  const committed = judged && base ? (git(['diff', '--name-only', '-z', base, after]) ?? '').split('\0').filter(Boolean) : [];
  const added = unnamed(committed.filter((path) => !before.staged.includes(path)));
  if (added.length > 0) problems.push(`it committed in ${after.slice(0, 7)} paths it neither names nor had staged: ${added.join(', ')}. Report the commit; do not rewrite it without authorization`);
}
const appeared = judged ? unnamed(staged().filter((path) => !before.staged.includes(path))) : [];
if (appeared.length > 0) {
  problems.push(`these paths became staged during it without being named: ${appeared.join(', ')}. If it staged them, unstage them with git restore --staged -- <path>; if another session or the user did, leave them and report it`);
}
if (problems.length > 0) {
  console.error(`27-version-control.md: after this command, ${problems.join('; ')}. Stage the authorized change by explicit paths.`);
  process.exit(2);
}
