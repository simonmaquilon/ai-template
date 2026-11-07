// Records when a session's turn began for check-file-length.mjs, in a file under .temp/ that a sandboxed command
// can write too while the hook runs outside the sandbox: nothing here follows a symlink or touches a file that is
// not marker-shaped, so such a command cannot make the hook overwrite or delete a protected file.

import { closeSync, constants, fstatSync, readdirSync, readSync, unlinkSync, writeSync } from 'node:fs';
import { inFolder, openRegular } from './safe-fs.mjs';

const LIFETIME = 7 * 24 * 60 * 60 * 1000;

// Whether `name` is a regular file of at most 20 bytes that holds only digits and has not changed for a week.
function isIdleMarker(name) {
  let fd;
  try {
    fd = openRegular(name, constants.O_RDONLY);
    const { size, mtimeMs } = fstatSync(fd);
    if (size > 20 || Date.now() - mtimeMs <= LIFETIME) return false;
    const text = Buffer.alloc(size);
    readSync(fd, text, 0, size, 0);
    return /^\d+$/.test(text.toString('latin1'));
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// Writes the marker `name` in `folder` (relative to the repository root) and drops the markers of idle sessions,
// unless a symlink makes the folder lead anywhere but its place under the root.
export function markTurnStart(root, folder, name) {
  inFolder(root, folder, true, () => {
    let fd;
    try {
      fd = openRegular(name, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC);
      writeSync(fd, String(Date.now()));
    } catch {
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
    // Session ids carry no dot, and a marker holds the digits of a time, so nothing else is ever removed.
    for (const entry of readdirSync('.')) {
      if (/^[\w-]+$/.test(entry) && isIdleMarker(entry)) unlinkSync(entry);
    }
  });
}
