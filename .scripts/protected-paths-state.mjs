// Fingerprints the protected paths of a project before and after a shell command, for the protected-paths hook
// (AGENTS.md). A fingerprint maps every file, link, and folder under the paths to a SHA-256 of the file's content, the
// text of the link, or a folder marker; nothing follows a link, so a link is compared by where it points. It skips
// .temp/, which holds hook state and caches, not protected code. The fingerprint taken before a command waits in
// .temp/protected-paths/<name>, a folder a sandboxed command can write too, and the hook writes it outside the
// sandbox, so nothing here follows a symlink (safe-fs.mjs). A command that changes a protected path and also rewrites
// that file within the same command hides the change; the file is only as safe as .temp/.

import { createHash } from 'node:crypto';
import { closeSync, constants, lstatSync, readFileSync, readdirSync, readlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inFolder, openRegular } from './safe-fs.mjs';

const FOLDER = '.temp/protected-paths';
const LIFETIME = 24 * 60 * 60 * 1000;

// The fingerprint of the paths, relative to the root, as a Map from each path found to its hash.
export function fingerprint(root, paths) {
  const found = new Map();
  const visit = (path) => {
    if (path === '.temp' || path.startsWith('.temp/')) return;
    const full = join(root, path);
    const stats = lstatSync(full, { throwIfNoEntry: false });
    if (!stats) return;
    if (stats.isSymbolicLink()) found.set(path, `link ${readlinkSync(full)}`);
    else if (stats.isDirectory()) {
      found.set(path, 'folder');
      for (const entry of readdirSync(full).sort()) visit(`${path}/${entry}`);
    } else found.set(path, stats.isFile() ? createHash('sha256').update(readFileSync(full)).digest('hex') : 'other');
  };
  paths.forEach(visit);
  return found;
}

// The paths whose hash differs between two fingerprints, as `path (added|changed|removed)`, sorted.
export function differences(before, after) {
  const state = (path) => (!before.has(path) ? 'added' : !after.has(path) ? 'removed' : 'changed');
  return [...new Set([...before.keys(), ...after.keys()])].filter((path) => before.get(path) !== after.get(path))
    .sort().map((path) => `${path} (${state(path)})`);
}

// The file name that pairs a command's fingerprints: the session and the tool call, each cut to characters a file
// name keeps, or null when the client sends neither.
export function stateName(input) {
  const part = (value) => String(value ?? '').replace(/[^\w-]/g, '_').slice(0, 80);
  const name = [input?.session_id, input?.tool_use_id].map(part).filter(Boolean).join('-');
  return name || null;
}

// Keeps a fingerprint under `name`, and drops the ones a day old, left by commands that never reported back.
export function saveFingerprint(root, name, found) {
  inFolder(root, FOLDER, true, () => {
    for (const entry of readdirSync('.')) {
      const stats = /^[\w-]+$/.test(entry) ? lstatSync(entry, { throwIfNoEntry: false }) : null;
      if (stats?.isFile() && Date.now() - stats.mtimeMs > LIFETIME) unlinkSync(entry);
    }
    const fd = openRegular(name, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC);
    try {
      writeFileSync(fd, JSON.stringify([...found]));
    } finally {
      closeSync(fd);
    }
  });
}

// Reads and removes the fingerprint kept under `name`, or returns null when there is none or it is not one.
export function takeFingerprint(root, name) {
  try {
    return inFolder(root, FOLDER, false, () => {
      let found;
      let fd;
      try {
        fd = openRegular(name, constants.O_RDONLY);
        found = new Map(JSON.parse(readFileSync(fd, 'utf8')));
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
      try {
        unlinkSync(name);
      } catch {}
      return found;
    }) ?? null;
  } catch {
    return null;
  }
}
