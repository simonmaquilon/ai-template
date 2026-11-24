// How run-lock-store.mjs removes an expired lock file so that two processes never both remove it, and so that a process
// that dies halfway leaves nothing that blocks the next one for good. The removal of one lock instance is claimed by
// creating, exclusively, a guard file named after the random token in its record and a level,
// <name>.<token>.<level>.reclaim. A token belongs to one instance, so no guard name ever stands for two lock files, and
// removing a guard never takes another process's claim on a different instance. The claimant reads the lock file again
// and removes it only if it still carries that token and is still expired. A guard older than GUARD_MS belongs to a
// claimant that died: whoever finds it claims the next level instead of deleting it, so no level is ever taken over.
// The claimant sweeps the guards of the instance right after removing it; one that dies between the two leaves its
// guard, which stays until the next recovery of that name sweeps it once it is older than GUARD_MS. The only way left
// for two claimants to coexist is a process suspended for longer than GUARD_MS between its second read and its
// removal, the same pause that lets a holder lose its lock after EXPIRY_MS.

import { readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export const GUARD_MS = 5000;
const TOKEN = /^[0-9a-z-]{1,64}$/;
// Whether the error of an exclusive creation says the name is taken. Windows answers EPERM, EACCES or EBUSY for a name
// whose file is being deleted, which passes; one that does not pass is for the caller to tell from a real denial.
export const taken = ({ code }) => code === 'EEXIST' || (process.platform === 'win32' && ['EPERM', 'EACCES', 'EBUSY'].includes(code));

export const guardOf = (file, token, level) => `${file.slice(0, -'.json'.length)}.${token}.${level}.reclaim`;

// The token of the record, 'none' for a file without a usable one, and null when there is no file.
function tokenOf(file) {
  try {
    const { token } = JSON.parse(readFileSync(file, 'utf8'));
    return typeof token === 'string' && TOKEN.test(token) ? token : 'none';
  } catch (error) {
    return error.code === 'ENOENT' ? null : 'none';
  }
}

function older(path, ms) {
  try {
    return Date.now() - statSync(path).mtimeMs > ms;
  } catch {
    return false;
  }
}

function drop(path) {
  try {
    unlinkSync(path);
  } catch {
    // Already gone.
  }
}

// Removes the own guard and the old guards of lock instances that are no longer there.
function sweep(file, own) {
  const prefix = `${basename(file, '.json')}.`;
  const current = tokenOf(file);
  for (const entry of readdirSync(dirname(file))) {
    const found = entry.startsWith(prefix) && /^([0-9a-z-]+)\.\d+\.reclaim$/.exec(entry.slice(prefix.length));
    const path = join(dirname(file), entry);
    if (found && (path === own || (found[1] !== current && older(path, GUARD_MS)))) drop(path);
  }
}

// True when this process claimed the removal and did what it came for; false when the file is no longer expired or
// another claimant is at work.
export function reclaim(file, expiryMs) {
  const token = tokenOf(file);
  if (token === null || !older(file, expiryMs)) return false;
  let guard;
  for (let level = 1; !guard; level++) {
    const candidate = guardOf(file, token, level);
    try {
      writeFileSync(candidate, '', { flag: 'wx' });
      guard = candidate;
    } catch (error) {
      if (!taken(error)) throw error;
      if (!older(candidate, GUARD_MS)) return false;
    }
  }
  if (tokenOf(file) === token && older(file, expiryMs)) drop(file);
  sweep(file, guard);
  return true;
}
