// Shared runtime for the repository's hook scripts, which must behave the same
// on every supported operating system: reading the agent client's hook input,
// running git without a shell, locating the repository root, and writing paths
// with forward slashes, the form git reads and prints on every system.

import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));

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

// A directory identified by device and inode, so any spelling of its path, through a symlink or in another letter
// case, names the same one; null when it cannot be read.
function identity(path) {
  const stats = statSync(path, { bigint: true, throwIfNoEntry: false });
  return stats ? `${stats.dev}:${stats.ino}` : null;
}

// The git directory a working tree shares with its linked worktrees, or null outside git.
function commonDir(cwd) {
  const run = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' });
  return run.status === 0 ? identity(resolve(cwd, run.stdout.trim())) : null;
}

// The git directory of the repository holding these scripts: the .git directory beside them when they sit at its
// root, as usual, without asking git; otherwise, as in a linked worktree or a submodule, whose .git is a file, git's.
let scriptsCommonDir;
function ownCommonDir() {
  const beside = resolve(SCRIPTS, '..', '.git');
  scriptsCommonDir ??= statSync(beside, { throwIfNoEntry: false })?.isDirectory() ? identity(beside) : commonDir(SCRIPTS);
  return scriptsCommonDir;
}

// Whether a git directory belongs to a repository other than the one holding these scripts, such as an independent
// project nested in it, which this repository's rules do not govern. Linked worktrees of this repository share its
// git directory and count as it. Whenever the answer is uncertain, as when GIT_DIR fixes the repository from the
// environment or either git directory cannot be read, it is false, so the rules keep applying.
function isOther(common) {
  if (process.env.GIT_DIR || process.env.GIT_COMMON_DIR || common === null) return false;
  const own = ownCommonDir();
  return own !== null && common !== own;
}

export const inOtherRepository = (dir) => isOther(commonDir(dir));

// Moves to the repository root and returns it, or returns null outside git and in another repository. One git call
// usually gives both the root and the git directory; output that is not exactly those two lines, as from a path
// holding a line break, is read again with one call each.
export function enterRepositoryRoot() {
  const lines = git(['rev-parse', '--show-toplevel', '--git-common-dir'])?.split('\n');
  let [root, common] = lines ?? [];
  if (lines && (lines.length !== 3 || !root || !common)) {
    root = git(['rev-parse', '--show-toplevel'])?.replace(/\n$/, '');
    common = git(['rev-parse', '--git-common-dir'])?.replace(/\n$/, '');
  }
  if (!root || isOther(common ? identity(resolve(process.cwd(), common)) : null)) return null;
  process.chdir(root);
  return root;
}

export function toPosix(path) {
  return path.split(sep).join('/');
}
