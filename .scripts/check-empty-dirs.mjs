#!/usr/bin/env node
// Reports directories that are empty and not ignored, against the directory
// lifecycle of 05-repo-layout.md. Runs from any directory of the repository and
// prints plain text, which the agent clients add to the model's context; prints
// nothing when there is none or outside git. Directories git ignores, symlinks,
// and the .git directory are not walked.

import { readdirSync } from 'node:fs';
import { enterRepositoryRoot, git } from './hook-support.mjs';

if (!enterRepositoryRoot()) process.exit(0);

const listed = git(['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z']) ?? '';
const ignored = new Set(listed.split('\0').filter((path) => path.endsWith('/')).map((path) => path.slice(0, -1)));

const empty = [];
function walk(dir) {
  const entries = readdirSync(dir || '.', { withFileTypes: true });
  if (entries.length === 0 && dir) empty.push(dir);
  for (const entry of entries) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory() && path !== '.git' && !ignored.has(path)) walk(path);
  }
}
walk('');

if (empty.length > 0) console.log(`Empty directories (05-repo-layout.md): ${empty.map((dir) => `./${dir}`).join('\n')}`);
