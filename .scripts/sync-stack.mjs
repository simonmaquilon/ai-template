#!/usr/bin/env node
// Regenerates the blocks of STACK.md between <!-- stack:generated <id> --> and
// <!-- /stack:generated <id> --> from the files that pin their facts, keeping
// the Notes column of every row whose first cell still exists. Everything
// outside the markers is left as written (33-stack-register.md).
//   node .scripts/sync-stack.mjs          rewrite STACK.md and say what changed
//   node .scripts/sync-stack.mjs --hook   the same, reporting as an agent hook
// It writes and reports nothing when STACK.md is already up to date, and a
// block whose markers or sources are unusable stays as it is.

import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHookInput } from './hook-support.mjs';
import * as sources from './stack-sources.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RULE = '33-stack-register.md';
const BLOCKS = {
  runtime: [sources.runtime, ['Source', 'Constraint'], 'package.json engines, .nvmrc, or .node-version'],
  'package-manager': [sources.packageManager, ['Package manager', 'Version', 'Source'], 'package.json packageManager or a lockfile'],
  dependencies: [sources.dependencies, ['Package', 'Declared', 'Resolved', 'Role', 'License'], 'package.json'],
  skills: [sources.skills, ['Skill', 'Source', 'Pinned by'], 'skills-lock.json or .agents/skills'],
  'mcp-servers': [sources.mcpServers, ['Server', 'Claude Code', 'Codex', 'Endpoint or command'], '.mcp.json or .codex/config.toml'],
  plugins: [sources.plugins, ['Plugin', 'Marketplace', 'Enabled'], 'enabledPlugins in .claude/settings.json'],
  workflows: [sources.workflows, ['Workflow', 'Runners', 'Node', 'Actions'], '.github/workflows'],
};
const MARKER = /<!-- (\/?)stack:generated ([\w-]+) -->/g;

const cell = (value) => String(value).replace(/\r?\n/g, ' ').replace(/<!--|-->/g, '').replace(/(?<!\\)\|/g, '\\|');
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((value) => value.trim());

// Notes come from the last column of a table whose header ends in Notes,
// whatever its other columns, so a changed layout keeps them.
function notesOf(body) {
  const rows = body.split(/\r?\n/).filter((line) => line.trim().startsWith('|')).map(cells);
  if (rows.length < 2 || rows[0].at(-1) !== 'Notes') return new Map();
  const width = rows[0].length;
  return new Map(rows.slice(2).map((row) => [row[0], row.slice(width - 1).join(' \\| ')]));
}

function render(id, body, eol) {
  const [read, header, source] = BLOCKS[id];
  const rows = read(ROOT);
  if (!rows || rows.length === 0) return `_None found in ${source}._`;
  const notes = notesOf(body);
  const columns = [...header, 'Notes'];
  return [`| ${columns.join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${[...row.map(cell), notes.get(cell(row[0])) ?? ''].join(' | ')} |`.replace(/ +\|$/, ' |'))].join(eol);
}

// Pairs every start marker with the next marker, which must end the same id.
function blocks(text) {
  const markers = [...text.matchAll(MARKER)];
  const found = [];
  const failed = [];
  for (let i = 0; i < markers.length; i += 1) {
    const [start, end] = [markers[i], markers[i + 1]];
    if (start[1] === '/') continue;
    if (end?.[1] === '/' && end[2] === start[2]) found.push([start, end]);
    else failed.push(start[2]);
  }
  return { found, failed };
}

function sync() {
  const path = join(ROOT, 'STACK.md');
  if (!existsSync(path) || !lstatSync(path).isFile()) return { changed: [], failed: [] };
  const before = readFileSync(path, 'utf8');
  const eol = before.includes('\r\n') ? '\r\n' : '\n';
  const { found, failed } = blocks(before);
  const changed = new Set();
  let after = '';
  let last = 0;
  for (const [start, end] of found) {
    const id = start[2];
    const stop = end.index + end[0].length;
    let replacement = before.slice(start.index, stop);
    try {
      if (BLOCKS[id]) replacement = `${start[0]}${eol}${render(id, before.slice(start.index + start[0].length, end.index).trim(), eol)}${eol}${end[0]}`;
    } catch {
      failed.push(id);
    }
    if (replacement !== before.slice(start.index, stop)) changed.add(id);
    after += before.slice(last, start.index) + replacement;
    last = stop;
  }
  after += before.slice(last);
  if (after !== before) writeFileSync(path, after);
  return { changed: [...changed], failed: [...new Set(failed)] };
}

const hook = process.argv.includes('--hook');
const input = hook ? await readHookInput() : {};
const lines = [];
try {
  const { changed, failed } = sync();
  if (changed.length > 0) lines.push(`STACK.md synced (${RULE}): ${changed.join(', ')}. Review the change; only the Notes columns are edited by hand.`);
  if (failed.length > 0) lines.push(`STACK.md blocks not synced (${RULE}): ${failed.join(', ')}; check their markers and sources.`);
} catch (error) {
  if (!hook) throw error;
  lines.push(`STACK.md not synced (${RULE}): ${error.code ?? 'unreadable or unwritable'}.`);
}
if (lines.length === 0) process.exit(0);
const message = lines.join('\n');
if (hook && input.hook_event_name === 'PostToolUse') {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message } }));
} else {
  console.log(message);
}
