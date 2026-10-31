#!/usr/bin/env node
// Removes directories that are empty and not ignored, against the directory
// lifecycle of 03-code-authoring.md. Runs from any directory of the repository and
// prints plain text, which the agent clients add to the model's context; prints
// nothing when there is none, outside git, or in another repository, such as an
// independent project nested in this one. Directories an ignore rule matches,
// symlinks, unreadable directories, and .git directories at any depth are not
// walked; one git lists as ignored only because everything in it is ignored is.
// An empty .claude/.cc-writes folder Claude Code leaves below the root is removed
// even when an ignore rule hides it, and so is the .claude it leaves empty; the one
// at the root stays, because sessions opened there use it. A non-recursive removal
// preserves any file added during the scan, including placeholders such as .gitkeep.

import { spawnSync } from 'node:child_process';
import { readdirSync, rmdirSync } from 'node:fs';
import { enterRepositoryRoot, git } from './hook-support.mjs';

if (!enterRepositoryRoot()) process.exit(0);

const listed = git(['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z']);
if (listed === null) process.exit(0);
const ignored = new Set(listed.split('\0').filter((path) => path.endsWith('/')).map((path) => path.slice(0, -1)));

// The directories among paths that an ignore rule matches themselves; when git fails, all of them, so none is walked.
function ruled(paths) {
  if (paths.length === 0) return new Set();
  const run = spawnSync('git', ['check-ignore', '--stdin', '-z'], { input: paths.join('\0'), encoding: 'utf8' });
  if (run.status === 0) return new Set(run.stdout.split('\0'));
  return new Set(run.status === 1 ? [] : paths);
}

const removed = [];
const skipped = ['EACCES', 'EPERM', 'ENOENT', 'ENOTDIR'];

function list(dir) {
  try {
    return readdirSync(dir || '.', { withFileTypes: true });
  } catch (error) {
    if (!skipped.includes(error.code)) throw error;
    return null;
  }
}

function remove(dir) {
  try {
    rmdirSync(dir);
    removed.push(dir);
    return true;
  } catch (error) {
    if (!['ENOTEMPTY', 'EEXIST', 'EBUSY', ...skipped].includes(error.code)) throw error;
    return false;
  }
}

// An ignored directory stays, except an empty .claude/.cc-writes below the root and the .claude holding only it.
function clean(path) {
  if (path.endsWith('/.claude/.cc-writes')) remove(path);
  else if (path.endsWith('/.claude')) {
    const entries = list(path);
    if (entries?.length === 1 && entries[0].name === '.cc-writes' && entries[0].isDirectory() && remove(`${path}/.cc-writes`)) remove(path);
  }
}

const listedRuled = ruled([...ignored]);

// hidden: git lists dir as ignored only because everything in it is, so every directory inside is ignored too.
function walk(dir, hidden) {
  const entries = list(dir);
  if (!entries) return;
  const dirs = entries.filter((entry) => entry.isDirectory() && entry.name !== '.git').map((entry) => (dir ? `${dir}/${entry.name}` : entry.name));
  const matched = hidden ? ruled(dirs) : listedRuled;
  for (const path of dirs) {
    if (path === '.claude/.cc-writes') continue;
    if (!hidden && !ignored.has(path)) walk(path, false);
    else if (!matched.has(path)) walk(path, true);
    else clean(path);
  }
  if (dir && list(dir)?.length === 0) remove(dir);
}
walk('', false);

if (removed.length > 0) console.log(`Removed empty directories (03-code-authoring.md): ${removed.map((dir) => `./${dir}`).join('\n')}`);
