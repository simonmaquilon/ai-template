// Helpers for the hooks that write, outside the sandbox, in folders a sandboxed command can write too (.temp/ and
// .docs/): none of them follows a symlink, so such a command cannot redirect a hook's read, write, or removal to a
// protected file.

import { closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Runs `work` with the folder `folder` (a path of forward slashes below `root`) as the working directory, and returns
// its result, or undefined without running it when a symlink makes any segment of that path lead elsewhere. With
// `create`, missing segments are made, each only once the folder above it is known to be the real one.
// Changing directory is safe here: a hook is a short single-task process, the directory is restored afterwards, and
// the working directory pins the folder that was verified, so operations on bare names inside `work` reach that
// folder even if its path is swapped for a link right afterwards, which no operation on the path could promise.
export function inFolder(root, folder, create, work) {
  const home = process.cwd();
  try {
    process.chdir(root);
    let expected = realpathSync.native(root);
    for (const segment of folder.split('/')) {
      if (create) {
        try {
          mkdirSync(segment);
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
        }
      }
      process.chdir(segment);
      expected = join(expected, segment);
      if (realpathSync.native('.') !== expected) return undefined;
    }
    return work();
  } finally {
    process.chdir(home);
  }
}

// A descriptor of a regular file of the working directory, reached without following a symlink or blocking on a
// named pipe; where the system has no O_NOFOLLOW, as on Windows, an lstat check stands in for it.
export function openRegular(name, flags) {
  if (constants.O_NOFOLLOW === undefined && lstatSync(name, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw Object.assign(new Error('symlink'), { code: 'ELOOP' });
  }
  const fd = openSync(name, flags | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0));
  if (fstatSync(fd).isFile()) return fd;
  closeSync(fd);
  throw new Error('not a regular file');
}

// The bytes and permission bits of the regular file `name` of the working directory, which a link never replaces.
export function readRegular(name) {
  const fd = openRegular(name, constants.O_RDONLY);
  try { return [readFileSync(fd), fstatSync(fd).mode & 0o777]; } finally { closeSync(fd); }
}

// Removes the temporary copies of `name` (`.<name>.sync-<digits>`) that a process which died before renaming left in the
// working directory: regular files only, never a link or a folder, untouched for over a minute, since a recent one may
// belong to a process still writing. One that cannot be removed stays, and never stops the caller.
const ORPHAN_AGE_MS = 60_000;
function removeOrphans(name) {
  const prefix = `.${name}.sync-`;
  let entries = [];
  try { entries = readdirSync('.'); } catch { return; }
  for (const entry of entries.filter((candidate) => candidate.startsWith(prefix) && /^\d+$/.test(candidate.slice(prefix.length)))) {
    try {
      const stat = lstatSync(entry);
      if (stat.isFile() && Date.now() - stat.mtimeMs > ORPHAN_AGE_MS) rmSync(entry, { force: true });
    } catch {}
  }
}

// Renames a finished copy over `name` of the working directory, so no reader sees it half written, unless `name` no
// longer holds `original`, the bytes `content` came from: another writer got there first. Returns whether it replaced.
// A removed `name` fails the re-read. Only the temporary copy this call created is ever removed: when it cannot be
// created, as when something else holds its name, the error propagates and that something stays. Before creating its
// own, it removes the old temporary copies an earlier, dead call left.
export function replaceRegular(name, original, content, mode) {
  removeOrphans(name);
  const temp = `.${name}.sync-${process.pid}`;
  const fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode);
  try {
    try { fchmodSync(fd, mode); writeFileSync(fd, content); } finally { closeSync(fd); }
    if (!readRegular(name)[0].equals(original)) return false;
    renameSync(temp, name);
    return true;
  } finally { rmSync(temp, { force: true }); }
}
