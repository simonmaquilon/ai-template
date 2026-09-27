// Decides which files the source-file limit of 14-code-authoring.md covers. Any
// text file counts as source except documentation, data, configuration,
// lockfiles, and binaries, recognized here by extension or name; ignored files;
// and files that git attributes mark linguist-generated, linguist-vendored, or
// -source-file-limit, the attribute for any other exempt file.

import { basename, extname } from 'node:path';

const EXEMPT_EXTENSIONS = new Set([
  '.md', '.markdown', '.mdx', '.txt', '.rst', '.adoc', '.json', '.jsonc', '.json5', '.jsonl', '.ndjson', '.geojson',
  '.ipynb', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.config', '.properties', '.plist', '.env', '.csv',
  '.tsv', '.xml', '.svg', '.po', '.pot', '.arb', '.strings', '.xlf', '.xliff', '.resx', '.sln', '.csproj', '.fsproj',
  '.vbproj', '.props', '.targets', '.pbxproj', '.pem', '.lock', '.lockb', '.lockfile', '.resolved', '.sum', '.map',
  '.snap', '.log',
]);
const EXEMPT_NAMES = /^(\.[^.]+|\.env\..*|(license|licence|copying|notice)([-.].*)?|authors|changelog|contributing|readme)$/i;
const SOURCE_NAMES = /^cmakelists\.txt$/i;
const ATTRIBUTES = ['linguist-generated', 'linguist-vendored', 'source-file-limit'];

export function isSource(path) {
  const name = basename(path);
  return SOURCE_NAMES.test(name) || (!EXEMPT_EXTENSIONS.has(extname(path).toLowerCase()) && !EXEMPT_NAMES.test(name));
}

// Paths that git ignores or whose attributes exempt them, using the given git
// runner, which returns a command's stdout or null.
export function exemptPaths(paths, git) {
  const exempt = new Set();
  const ignored = git(['check-ignore', '-z', '--stdin'], paths.join('\0'));
  for (const path of (ignored ?? '').split('\0').filter(Boolean)) exempt.add(path);
  const values = (git(['check-attr', '-z', '--stdin', ...ATTRIBUTES], paths.join('\0')) ?? '').split('\0');
  for (let i = 0; i + 2 < values.length; i += 3) {
    const [path, name, value] = values.slice(i, i + 3);
    if (name === 'source-file-limit' ? value === 'unset' : value === 'set' || value === 'true') exempt.add(path);
  }
  return exempt;
}
