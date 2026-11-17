// Records when a session's turn began for check-file-length.mjs, or a turn or a subagent began for
// check-plan-stop.mjs, in a file under .temp/ that a sandboxed command
// can write too while the hook runs outside the sandbox: nothing here follows a symlink or touches a file that is
// not marker-shaped, so such a command cannot make the hook overwrite or delete a protected file. The sweep of idle
// markers also removes the <session>.stop brake state of stop-brake.mjs, which has its own shape. This file also holds
// the tokens that end the continuation prompts of both stop hooks and the one test of them that both turn starts use:
// a prompt that carries a token is that continuation, never a new turn, so it never redoes a marker.

import { closeSync, constants, fstatSync, readdirSync, readSync, unlinkSync, writeSync } from 'node:fs';
import { inFolder, openRegular } from './safe-fs.mjs';

const LIFETIME = 7 * 24 * 60 * 60 * 1000;
// Fixed strings no person writes, which tell a stop hook's continuation prompt wherever the client places the reason.
export const PLAN_STOP_TOKEN = '[check-plan-stop:continuation]';
export const FILE_LENGTH_TOKEN = '[check-file-length:continuation]';

// Whether a UserPromptSubmit prompt is the continuation of either stop hook, whatever text the client puts before it.
export const isContinuation = (prompt) => typeof prompt === 'string' && [PLAN_STOP_TOKEN, FILE_LENGTH_TOKEN].some((token) => prompt.includes(token));

// Whether `name` is a regular file of at most 80 bytes that holds a time in digits, and after it only the fingerprint
// lines of a brake state, and has not changed for a week.
function isIdleMarker(name) {
  let fd;
  try {
    fd = openRegular(name, constants.O_RDONLY);
    const { size, mtimeMs } = fstatSync(fd);
    if (size > 80 || Date.now() - mtimeMs <= LIFETIME) return false;
    const text = Buffer.alloc(size);
    readSync(fd, text, 0, size, 0);
    return /^\d{1,20}(\n[0-9a-f]{16}){0,3}$/.test(text.toString('latin1'));
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
    // Session ids carry no dot, and a marker or a brake state holds a time's digits, so nothing else is ever removed.
    for (const entry of readdirSync('.')) {
      if (/^[\w-]+(\.stop)?$/.test(entry) && isIdleMarker(entry)) unlinkSync(entry);
    }
  });
}
