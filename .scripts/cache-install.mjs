// What the launchers that run unconfined, browser.mjs and mobile-server.mjs, share to install a package at the version
// .agents/tool-versions.json records: a per-user cache folder outside the repository and the temporary directory, where
// confined commands cannot write, and an install that npm records and that is compared with that file on each launch.

import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { lockMismatch } from './browser-lock.mjs';
import { npmScripts } from './npm-cli.mjs';
import { TOOL_VERSIONS } from './tool-versions-file.mjs';

// The per-user cache folder `folder` of each system, which the client sandbox does not let confined commands write.
export function cacheDir(folder) {
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), folder);
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', folder);
  return join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), folder);
}

// The cache folder when it cannot be written, else null. The folder may not exist yet, and then its nearest existing
// ancestor must take the new one.
export function unwritableCache(folder) {
  const cache = cacheDir(folder);
  let path = cache;
  while (!existsSync(path) && dirname(path) !== path) path = dirname(path);
  try {
    accessSync(path, constants.W_OK);
    return null;
  } catch {
    return cache;
  }
}

// The folder holding `name`@`version`, installed there when what npm recorded in it does not match `expected`, a map of
// package name to { version, integrity? } (browser-lock.mjs); a mismatch after a new install removes the folder.
// `fail(message)` ends the process, `announce(dir)` runs before an install, and `timeout` bounds npm, in milliseconds.
export function install({ folder, name, version, expected, fail, announce, timeout }) {
  const dir = join(cacheDir(folder), `${name}-${version}`);
  if (lockMismatch(dir, expected, TOOL_VERSIONS) === undefined) return dir;
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{ "private": true }\n');
  const scripts = npmScripts() ?? fail('npm CLI scripts not found for this Node');
  announce?.(dir);
  const run = spawnSync(process.execPath, [join(scripts, 'npm-cli.js'), 'install', '--no-save', '--ignore-scripts',
    '--no-audit', '--no-fund', `${name}@${version}`], { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'], timeout });
  if (run.status !== 0) fail(`installing ${name}@${version} in ${dir} failed`);
  const why = lockMismatch(dir, expected, TOOL_VERSIONS);
  if (why === undefined) return dir;
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  return fail(`npm installed ${why}; the folder was removed and nothing ran`);
}
