// The files that `check-markdown.mjs --all` lints: the .md files Git lists from the repository root that are regular
// files whose real path stays inside the repository and that are not skipped by attribute: vendored or generated files
// are skipped unless `markdown-structure` is set on them, and `-markdown-structure` skips any file. Also the attribute
// filter that the edit hook of check-markdown.mjs shares.

import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
import { enterRepositoryRoot, git, toPosix } from './hook-support.mjs';

export function marked(paths) {
  const attributes = ['linguist-generated', 'linguist-vendored', 'markdown-structure'];
  const fields = git(['check-attr', '-z', '--stdin', ...attributes], paths.join('\0'))?.split('\0');
  if (!fields) return fields;
  const values = new Map();
  for (let i = 0; i + 2 < fields.length; i += 3) values.set(`${fields[i]}\0${fields[i + 1]}`, fields[i + 2]);
  const on = (path, name) => ['set', 'true'].includes(values.get(`${path}\0${name}`));
  return new Set(paths.filter((path) => values.get(`${path}\0markdown-structure`) === 'unset'
    || ((on(path, 'linguist-generated') || on(path, 'linguist-vendored')) && !on(path, 'markdown-structure'))));
}

// Whether a listed path is a regular file that stays inside the repository once its links are resolved. Only absence
// answers no for an error; any other, such as an unreadable folder, keeps the path so that the read step reports it.
function readableInside(path, canonicalRoot) {
  try {
    if (!lstatSync(path).isFile()) return false;
    const local = toPosix(relative(canonicalRoot, realpathSync.native(path)));
    return local !== '' && !local.startsWith('../') && !isAbsolute(local);
  } catch (error) {
    return !['ENOENT', 'ENOTDIR'].includes(error.code);
  }
}

export function repositoryMarkdown() {
  const root = enterRepositoryRoot();
  const canonicalRoot = root && realpathSync.native(root);
  const files = (root && git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']))
    ?.split('\0').filter((path) => /\.md$/i.test(path) && readableInside(path, canonicalRoot));
  const skipped = files && marked(files);
  if (skipped) return files.filter((path) => !skipped.has(path));
  console.error('--all: not checked; git or this repository is unavailable.');
  process.exit(2);
}
