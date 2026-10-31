// Locates npm's own CLI scripts (npm-cli.js and npx-cli.js) for the Node that
// runs these helpers, so they can be launched with that Node and no shell, and
// every argument reaches them literally on every system. PINNED_NPM_CLI_DIR,
// used by the tests, names the directory that holds them.

import { existsSync, realpathSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

// npm ships its CLI scripts beside Node on Windows and in ../lib/node_modules
// elsewhere; a separate npm on the PATH is found through its own bin.
export function npmScripts() {
  if (process.env.PINNED_NPM_CLI_DIR) return process.env.PINNED_NPM_CLI_DIR;
  const node = dirname(process.execPath);
  const candidates = [join(node, 'node_modules', 'npm', 'bin'), join(node, '..', 'lib', 'node_modules', 'npm', 'bin')];
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    candidates.push(join(dir, 'node_modules', 'npm', 'bin'));
    try {
      candidates.push(dirname(realpathSync(join(dir, 'npm'))));
    } catch {
      // No npm in this directory.
    }
  }
  return candidates.find((dir) => existsSync(join(dir, 'npm-cli.js')) && existsSync(join(dir, 'npx-cli.js'))) ?? null;
}
