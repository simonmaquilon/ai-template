// Shared runtime for the repository's hook scripts, which must behave the same
// on every supported operating system: reading the agent client's hook input,
// running git without a shell, locating the repository root, and writing paths
// with forward slashes, the form git reads and prints on every system.

import { spawnSync } from 'node:child_process';
import { sep } from 'node:path';

export function git(args, input) {
  const run = spawnSync('git', args, { input, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return run.status === 0 ? run.stdout : null;
}

// Hook input arrives as JSON on stdin; a missing or malformed payload reads as
// an empty object so that a hook never fails on its own input.
export async function readHookInput() {
  try {
    let text = '';
    for await (const chunk of process.stdin) text += chunk;
    return JSON.parse(text || '{}');
  } catch {
    return {};
  }
}

// Moves to the repository root and returns it, or returns null outside git.
export function enterRepositoryRoot() {
  const root = git(['rev-parse', '--show-toplevel'])?.trim();
  if (root) process.chdir(root);
  return root || null;
}

export function toPosix(path) {
  return path.split(sep).join('/');
}
