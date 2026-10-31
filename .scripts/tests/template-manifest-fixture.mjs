// Helpers for the template-manifest tests: a throwaway template checkout and a runner that proves a read-only mode
// wrote nothing.

import assert from 'node:assert/strict';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { TEMPLATE_ONLY } from '../template-manifest.mjs';
import { makeRepo } from './support.mjs';

export const MANIFEST = '.agents/template-manifest.json';
export const URL = 'https://example.invalid/owner/template.git';
// One tracked path per template-only entry; an entry ending in / is a directory.
export const ONLY = TEMPLATE_ONLY.map((entry) => (entry.endsWith('/') ? `${entry}case.test.mjs` : entry));

export function commit(repo) {
  repo.git('add', '-A');
  repo.git('commit', '-q', '-m', 'step');
  return repo;
}

export const cli = (repo, ...args) => repo.script('template-manifest.mjs', args);

// A template checkout whose origin is the URL its adoption guide records, holding owned and template-only files.
export function template(t) {
  const repo = makeRepo(t);
  repo.write('.gitattributes', '* text=auto eol=lf\n');
  repo.write('.agents/template-version', '1.0.0\n');
  repo.write('.readme/96-template-adoption.md', `La plantilla mantenida es el repositorio cuyo remoto \`origin\` apunta a \`${URL}\`, como fija otra regla.\n`);
  for (const [path, text] of Object.entries({ 'a.txt': 'a\n', 'B.txt': 'b\n', 'docs/c.md': 'c\n', 'crlf.txt': 'x\r\ny\r\n' })) repo.write(path, text);
  for (const path of ONLY) repo.write(path, 'only validates the template\n');
  repo.git('remote', 'add', 'origin', URL);
  return commit(repo);
}

// Everything in the working tree, with contents and times.
const snapshot = (repo) => readdirSync(repo.dir, { recursive: true })
  .filter((path) => path !== '.git' && !path.startsWith(`.git${sep}`))
  .map((path) => {
    const stats = lstatSync(join(repo.dir, path));
    return [path, stats.mtimeMs, stats.isFile() ? readFileSync(join(repo.dir, path), 'utf8') : ''];
  });

// Runs a read-only mode and fails when it changed anything in the working tree.
export function readOnly(repo, ...args) {
  const before = snapshot(repo);
  const result = cli(repo, ...args);
  assert.deepEqual(snapshot(repo), before, `${args[0]} wrote to the working tree`);
  return result;
}
