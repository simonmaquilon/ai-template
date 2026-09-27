#!/usr/bin/env node
// Reports documentation references that resolve to nothing, across the
// documentation this repository owns: relative Markdown links, and repository
// paths cited in inline code outside fenced blocks. A cited path is checked only
// when it contains a slash, carries no whitespace, wildcard, or placeholder, is
// neither a URL nor absolute, and starts with an entry of the repository root.
// A numbered file name cited alone, as instructions cite each other, must name
// one of the checked documents; its prefix of two or three digits followed by a
// letter tells it apart from a date or a record number.
// Missing paths that git ignores are skipped because they may be absent by
// design; without git they cannot be told apart, so no path is reported.
// Vendored and generated documentation is excluded because its structure
// belongs upstream. It runs from the repository root whatever directory it
// starts in, and reports paths with forward slashes on every system.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { enterRepositoryRoot, toPosix } from './hook-support.mjs';

enterRepositoryRoot();

const LINK = /\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)/g;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const FENCE = /^\s*(`{3,}|~{3,})/;
const CODE_SPAN = /`([^`]+)`/g;
const NOT_A_PATH = /[\s*[\]<>{}$~|]/;
const CITED_FILE = /^\d{2,3}-[a-z][\w-]*\.md$/;

function collect(dir, recurse) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (recurse && !entry.startsWith('.')) files.push(...collect(path, true));
    } else if (entry.endsWith('.md')) {
      files.push(path);
    }
  }
  return files;
}

function citedPaths(text, rootEntries) {
  const paths = [];
  let fence = null;
  for (const line of text.split('\n')) {
    const marker = FENCE.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    for (const [, span] of line.matchAll(CODE_SPAN)) {
      if (CITED_FILE.test(span)) {
        paths.push(span);
        continue;
      }
      if (!span.includes('/') || NOT_A_PATH.test(span) || EXTERNAL.test(span) || span.startsWith('/')) continue;
      if (rootEntries.has(span.split('/')[0])) paths.push(span);
    }
  }
  return paths;
}

// Returns the ignored subset of paths in a single git call, or null when git
// cannot answer. Exit status 1 only means that no path is ignored.
function ignoredPaths(paths) {
  if (paths.length === 0) return new Set();
  const git = spawnSync('git', ['check-ignore', '-z', '--stdin'], { input: paths.join('\0'), encoding: 'utf8' });
  if (git.status !== 0 && git.status !== 1) return null;
  return new Set(git.stdout.split('\0'));
}

const documents = [
  ...collect('.', false),
  ...collect('.agents/instructions', false),
  ...collect('.readme', true),
];
const rootEntries = new Set(readdirSync('.'));
const documentNames = new Set(documents.map((document) => basename(document)));

const brokenLinks = [];
const missingPaths = [];
for (const document of documents) {
  const text = readFileSync(document, 'utf8');
  for (const match of text.matchAll(LINK)) {
    const raw = match[1].replace(/^<|>$/g, '');
    const target = raw.split('#')[0];
    if (!target || EXTERNAL.test(raw)) continue;
    const resolved = resolve(dirname(document), decodeURIComponent(target));
    if (!existsSync(resolved)) brokenLinks.push(`${toPosix(document)} -> ${target}`);
  }
  for (const path of citedPaths(text, rootEntries)) {
    const found = CITED_FILE.test(path) ? documentNames.has(path) : existsSync(path) || existsSync(resolve(dirname(document), path));
    if (!found) missingPaths.push([document, path]);
  }
}

const ignored = ignoredPaths(missingPaths.map(([, path]) => path));
const brokenPaths = ignored
  ? [...new Set(missingPaths.filter(([, path]) => !ignored.has(path)).map(([document, path]) => `${toPosix(document)} -> ${path}`))]
  : [];

if (brokenLinks.length > 0) {
  console.log(`Broken documentation links (17-validation-policy.md): ${brokenLinks.join('; ')}`);
}
if (brokenPaths.length > 0) {
  console.log(`Broken documentation paths (17-validation-policy.md): ${brokenPaths.join('; ')}`);
}
