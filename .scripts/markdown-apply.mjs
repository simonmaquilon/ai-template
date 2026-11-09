// The --fix side of check-markdown.mjs: applies the `fix` that every warning of markdown-rules.mjs carries (see
// markdown-fixes.mjs), never one derived from a message, and writes a file only when attributes allow it.

import { lstatSync, realpathSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { toPosix } from './hook-support.mjs';
import { markdownWarnings } from './markdown-rules.mjs';

const BREAK = /\r\n?|\n/;
const MAX_PASSES = 20;

// One pass: the text with every warning's fix applied. Fixes that touch the same characters wait for the next pass.
function onePass(text) {
  const lines = text.split(BREAK);
  const breaks = text.match(/\r\n?|\n/g) ?? [];
  const newline = breaks[0] ?? '\n';
  const edits = new Map(), inserts = new Map(), removed = new Set();
  let finalNewline = false;
  for (const { line, fix } of markdownWarnings(text)) {
    const at = line - 1;
    if (fix.op === 'edit') edits.set(at, [...(edits.get(at) ?? []), fix]);
    if (fix.op === 'delete-line') removed.add(at);
    if (fix.op === 'blank') {
      const index = fix.where === 'before' ? fix.line - 1 : fix.line;
      if (!inserts.has(index)) inserts.set(index, fix.prefix);
    }
    if (fix.op === 'final-newline') finalNewline = true;
  }
  for (const [at, list] of edits) {
    let limit = lines[at].length;
    for (const { at: column, remove, insert } of list.sort((a, b) => b.at - a.at || b.remove - a.remove)) {
      if (column + remove > limit) continue;
      lines[at] = lines[at].slice(0, column) + insert + lines[at].slice(column + remove);
      limit = column;
    }
  }
  const out = [];
  lines.forEach((line, i) => {
    if (inserts.has(i)) out.push([inserts.get(i), newline]);
    if (!removed.has(i)) out.push([line, breaks[i] ?? '']);
  });
  if (finalNewline) out.push(['', '']);
  return out.map(([line, ending], i) => line + (i === out.length - 1 ? '' : ending || newline)).join('');
}

// The text with every correction applied, repeated until it no longer changes; a BOM stays in place.
function applyFixes(text) {
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  let current = text.slice(bom.length);
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const next = onePass(current);
    if (next === current) break;
    current = next;
  }
  return bom + current;
}

// The path of the file that a write to `file` reaches, relative to the working folder, so that the attributes are
// read for it and not for a spelling that goes through a symbolic link; the path as written when it cannot be resolved.
export function realPath(file) {
  try {
    return toPosix(relative(realpathSync.native('.'), realpathSync.native(file)));
  } catch {
    return file;
  }
}

// Why a file that is a symbolic link, or a hard link that other names reach, is not written; '' for a regular file.
function linkNote(file) {
  const info = lstatSync(file);
  return info.isSymbolicLink() ? 'symbolic link' : info.nlink > 1 ? 'hard link' : '';
}

// Fixes a file in place and returns the text to lint afterwards, with `note` set when the file was not modified:
// `skipped` holds the files the attributes exclude, null when git could not tell.
export function fixFile(file, bytes, skipped) {
  const text = bytes.toString('utf8');
  const refusal = !skipped ? 'file attributes unavailable'
    : skipped.has(realPath(file)) ? 'vendored or generated without markdown-structure, or marked -markdown-structure'
      : bytes.includes(0) || !Buffer.from(text, 'utf8').equals(bytes) ? 'not valid UTF-8 text'
        : linkNote(file);
  if (refusal) return { text, note: refusal };
  const fixed = applyFixes(text);
  if (fixed === text) return { text };
  try {
    writeFileSync(file, fixed);
  } catch (error) {
    return { text, note: error.code ?? error.message };
  }
  return { text: fixed };
}
