// Helpers for the hooks that write, outside the sandbox, in folders a sandboxed command can write too (.temp/ and
// .docs/): none of them follows a symlink, so such a command cannot redirect a hook's read, write, or removal to a
// protected file.

import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, realpathSync } from 'node:fs';
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
