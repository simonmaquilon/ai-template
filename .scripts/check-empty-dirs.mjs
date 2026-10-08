#!/usr/bin/env node
// Removes directories that are empty and not ignored, against the directory
// lifecycle of 05-repo-layout.md. Runs from any directory of the repository and
// prints plain text, which the agent clients add to the model's context; prints
// nothing when there is none, outside git, or in another repository, such as an
// independent project nested in this one. Directories git ignores, symlinks,
// and .git directories at any depth are not walked. A non-recursive removal preserves any
// file added during the scan, including placeholders such as .gitkeep.

import { readdirSync, rmdirSync } from 'node:fs';
import { enterRepositoryRoot, git } from './hook-support.mjs';

if (!enterRepositoryRoot()) process.exit(0);

const listed = git(['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z']);
if (listed === null) process.exit(0);
const ignored = new Set(listed.split('\0').filter((path) => path.endsWith('/')).map((path) => path.slice(0, -1)));

const removed = [];
function walk(dir) {
  const entries = readdirSync(dir || '.', { withFileTypes: true });
  for (const entry of entries) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory() && entry.name !== '.git' && !ignored.has(path)) walk(path);
  }
  if (!dir || readdirSync(dir).length > 0) return;
  try {
    rmdirSync(dir);
    removed.push(dir);
  } catch (error) {
    if (!['ENOTEMPTY', 'EEXIST', 'ENOENT', 'EBUSY'].includes(error.code)) throw error;
  }
}
walk('');

if (removed.length > 0) console.log(`Removed empty directories (05-repo-layout.md): ${removed.map((dir) => `./${dir}`).join('\n')}`);
