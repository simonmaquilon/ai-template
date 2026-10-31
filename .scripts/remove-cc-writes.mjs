#!/usr/bin/env node
// Removes the empty .claude/.cc-writes folders that Claude Code creates in each
// directory its shell works in, and the .claude folder each one leaves empty,
// anywhere in the repository holding this script, whatever directory it starts
// in, ignored folders and nested repositories included. The one at the
// repository root stays: Claude Code uses it in the sessions opened there and
// its sandbox protects it. Removes nothing that holds a file, follows no
// symlink and skips .git; a folder kept because it is not empty or the system
// refuses to remove it is listed with the error code (.readme/91-agent-sandbox.md).
//
//   node .scripts/remove-cc-writes.mjs

import { readdirSync, rmdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'));

const ROOT_FOLDER = '.claude/.cc-writes';
// rmdir refuses a folder that holds anything, that another process holds open, or that the sandbox protects.
const KEEPING = ['ENOTEMPTY', 'EEXIST', 'EBUSY', 'EPERM', 'EACCES'];
const removed = [];
const kept = [];

// Removes an empty folder and returns null, or returns the code of the error that kept it.
function removeEmpty(dir) {
  try {
    rmdirSync(dir);
  } catch (error) {
    if (!KEEPING.includes(error.code)) throw error;
    return error.code;
  }
  removed.push(dir);
  return null;
}

function walk(dir) {
  let emptied = false;
  for (const entry of readdirSync(dir || '.', { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.git') continue;
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.name !== '.cc-writes' || !/(^|\/)\.claude$/.test(dir)) walk(path);
    else if (path !== ROOT_FOLDER) {
      const code = removeEmpty(path);
      if (code) kept.push(`./${path} (${code})`);
      else emptied = true;
    }
  }
  if (emptied) removeEmpty(dir);
}
walk('');

if (removed.length > 0) console.log(`Removed:\n${removed.map((dir) => `./${dir}`).join('\n')}`);
if (kept.length > 0) console.log(`Kept, not empty or not removable:\n${kept.join('\n')}`);
if (removed.length + kept.length === 0) console.log('No .claude/.cc-writes folders to remove.');
