#!/usr/bin/env node
// Reports violations of the bug register schema (10-documents.md), without copying row contents: a state outside
// its section, a bug table outside Activos and Cerrados, a duplicate ID, and the TODO row beside real bugs. A file
// that is missing, outside the repository, or not a regular file, such as a directory or a named pipe, is no register.
import { closeSync, constants, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import { enterRepositoryRoot } from './hook-support.mjs';
import { readBlocks } from './markdown/blocks.mjs';
import { cells, escapeText, splitCode } from './markdown/inline.mjs';
import { openRegular } from './safe-fs.mjs';

const root = enterRepositoryRoot();
if (!root) process.exit(0);
const path = '.docs/bugs.md';
let text;
try {
  const target = realpathSync(path);
  const inside = relative(realpathSync(root), target);
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) process.exit(0);
  const fd = openRegular(target, constants.O_RDONLY);
  try { text = readFileSync(fd, 'utf8'); } finally { closeSync(fd); }
} catch (error) {
  if (['ENOENT', 'ENOTDIR', 'EISDIR', 'ELOOP'].includes(error.code) || error.message === 'not a regular file') {
    process.exit(0);
  }
  throw error;
}

const blocks = readBlocks(text);
const allowed = { Activos: new Set(['new', 'confirmed', 'in_progress', 'blocked']),
  Cerrados: new Set(['resolved', 'closed']) };
const value = (cell) => splitCode(cell.trim(), (content) => content.trim()).trim();
// The level 1 and 2 headings outside quotes, in document order, each naming its section or none.
const sections = blocks.headings.filter((heading) => heading.level <= 2 && blocks.quotes[heading.start] === '')
  .map((heading) => ({ line: heading.start, name: Object.hasOwn(allowed, heading.text) ? heading.text : null }));
const seen = new Set(), placeholders = [], findings = [];
let real = false, next = 0, section = null;
for (const table of blocks.tables) {
  const start = table.rows[0];
  while (next < sections.length && sections[next].line < start) section = sections[next++].name;
  const header = cells(blocks.texts[start]).map(value);
  const idColumn = header.indexOf('ID'), stateColumn = header.indexOf('Estado');
  if (idColumn < 0 || stateColumn < 0) continue;
  if (!section) { findings.push([start, 'bug table is outside Activos and Cerrados']); continue; }
  for (const line of table.rows.slice(2)) {
    const row = cells(blocks.texts[line]);
    const id = value(row[idColumn] ?? ''), state = value(row[stateColumn] ?? '');
    if (id === 'TODO') { placeholders.push(line); continue; }
    if (!id) continue;
    real = true;
    if (!allowed[section].has(state)) findings.push([line, 'state is invalid for its section']);
    if (seen.has(id)) findings.push([line, 'duplicate ID']);
    seen.add(id);
  }
}
if (real) for (const line of placeholders) findings.push([line, 'TODO coexists with a bug']);
for (const [line, message] of findings.sort((a, b) => a[0] - b[0])) {
  console.log(`${escapeText(path)}:${line + 1}: ${message} (10-documents.md; .docs/bugs.md schema)`);
}
