#!/usr/bin/env node
// Reports relative Markdown links that resolve to nothing, across the
// documentation this repository owns. Vendored and generated documentation is
// excluded because its structure belongs upstream.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const LINK = /\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)/g;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

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

const documents = [
  ...collect('.', false),
  ...collect('.agents/instructions', false),
  ...collect('.readme', true),
];

const broken = [];
for (const document of documents) {
  const text = readFileSync(document, 'utf8');
  for (const match of text.matchAll(LINK)) {
    const raw = match[1].replace(/^<|>$/g, '');
    const target = raw.split('#')[0];
    if (!target || EXTERNAL.test(raw)) continue;
    const resolved = resolve(dirname(document), decodeURIComponent(target));
    if (!existsSync(resolved)) broken.push(`${document} -> ${target}`);
  }
}

if (broken.length > 0) {
  console.log(`Broken documentation links (21-document-maintenance.md): ${broken.join('; ')}`);
}
