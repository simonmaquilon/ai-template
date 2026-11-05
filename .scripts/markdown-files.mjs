// The files that `check-markdown.mjs --all` lints: the .md files Git lists from the repository root that are regular
// files whose real path stays inside the repository and that no attribute marks vendored or generated. Also the
// attribute filter that the edit hook of check-markdown.mjs shares.

import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
import { enterRepositoryRoot, git, toPosix } from './hook-support.mjs';

export function marked(paths) {
  const fields = git(['check-attr', '-z', '--stdin', 'linguist-generated', 'linguist-vendored'], paths.join('\0'))?.split('\0');
  return fields && new Set(fields.filter((_, i) => i % 3 === 0 && ['set', 'true'].includes(fields[i + 2])));
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
