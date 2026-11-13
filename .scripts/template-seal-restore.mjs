// Restores the sealed files that template-seal-drift.mjs found changed and may be restored, for the seal of
// 01-meta-guidelines.md; the others are only reported. Each changed
// version that still exists is first copied to .temp/template-drift/<UTC>/<path>, and nothing is restored when that
// copy fails, so no work is lost. The original comes only from its blob in the local git repository, converted as a
// checkout would convert it for its path; a missing blob is reported, never replaced by invented content. A link is
// restored only when its target stays in the repository. No step follows a link: every folder is entered through
// safe-fs.mjs, and a restored file is written beside its place and renamed over it, so it never lands half written.

import { spawnSync } from 'node:child_process';
import { closeSync, constants, fstatSync, mkdirSync, openSync, readFileSync, readlinkSync, renameSync, symlinkSync, unlinkSync,
  writeSync } from 'node:fs';
import { isAbsolute, posix, resolve } from 'node:path';
import { git } from './hook-support.mjs';
import { inFolder, openRegular } from './safe-fs.mjs';
import { isBlobId } from './template-seal.mjs';
import { within } from './write-scope.mjs';

export const DRIFT = '.temp/template-drift';

const split = (path) => [posix.dirname(path), posix.basename(path)];
const below = (base, dir) => (dir === '.' ? base : `${base}/${dir}`);
const blob = (args) => {
  const run = spawnSync('git', args, { maxBuffer: 256 * 1024 * 1024 });
  return run.status === 0 ? run.stdout : null;
};

// What a sealed entry should hold, { link } or { bytes }, or { problem } when it cannot be had from the local blob.
function original({ path, id, want }) {
  const missing = { problem: `blob ${id.slice(0, 12)} is not in the local git repository; fetch the adopted release as `
    + '.readme/96-template-adoption.md shows, and the next prompt restores it' };
  if (!isBlobId(id)) return { problem: 'its manifest entry is not a blob id' };
  if (git(['cat-file', '-e', id]) === null) return missing;
  if (want === 'link') {
    const target = blob(['cat-file', 'blob', id])?.toString('utf8') ?? '';
    const lands = resolve(process.cwd(), posix.dirname(path), target);
    return target && !isAbsolute(target) && within(process.cwd(), lands) ? { link: target } : { problem: 'its link target leaves the repository' };
  }
  const bytes = blob(['cat-file', '--filters', `--path=${path}`, id]);
  if (!bytes) return missing;
  return git(['hash-object', `--path=${path}`, '--stdin'], bytes)?.trim() === id ? { bytes } : { problem: 'git converts its blob to other content' };
}

// The changed version of an entry, read without following a link, or undefined when a folder on its path is a link.
function changed({ path, current }) {
  const [dir, name] = split(path);
  return inFolder(process.cwd(), dir, false, () => {
    if (current === 'link') return { link: readlinkSync(name) };
    const fd = openRegular(name, constants.O_RDONLY);
    try {
      return { bytes: readFileSync(fd), mode: fstatSync(fd).mode & 0o777 };
    } finally {
      closeSync(fd);
    }
  });
}

// Writes content under a new name in the working directory, which it never follows or overwrites.
function create(name, { link, bytes, mode }) {
  if (link !== undefined) return symlinkSync(link, name);
  const fd = openSync(name, 'wx', mode);
  try {
    writeSync(fd, bytes);
  } finally {
    closeSync(fd);
  }
}

// Puts the original in place: written beside it under a temporary name, then renamed over whatever is there.
function put({ path, want }, content) {
  const [dir, name] = split(path);
  return inFolder(process.cwd(), dir, true, () => {
    const temp = `.${name}.seal-${process.pid}`;
    try {
      create(temp, { ...content, mode: want === 'exec' ? 0o777 : 0o666 });
      renameSync(temp, name);
    } catch (error) {
      try { unlinkSync(temp); } catch { /* nothing was created */ }
      throw error;
    }
    return true;
  });
}

// A new folder for this run's copies, named by the UTC time; another run in the same millisecond gets a suffix.
function stampFolder() {
  const stamp = new Date().toISOString().replace(/[-:.]/g, '');
  return inFolder(process.cwd(), DRIFT, true, () => {
    for (let n = 0; ; n++) {
      const name = n === 0 ? stamp : `${stamp}-${n}`;
      try {
        mkdirSync(name);
        return `${DRIFT}/${name}`;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
  });
}

// Restores each found entry and returns { results: [{ path, change, outcome }], folder }, folder being where the
// changed versions went, or null when none was saved.
export function restore(found) {
  let folder = null;
  const results = found.map((item) => {
    const done = (outcome) => ({ path: item.path, change: item.change, outcome });
    if (item.unsafe) return done('not restored');
    if (!isBlobId(item.id)) return done('not restored: its manifest entry is not a blob id');
    if (item.untrusted) return done(`not restored: ${item.untrusted}`);
    try {
      const content = original(item);
      if (content.problem) return done(`not restored: ${content.problem}`);
      const copy = item.current ? changed(item) : null;
      if (copy === undefined) return done('not restored: a folder on its path is a link');
      if (copy) {
        folder ??= stampFolder() ?? null;
        const [dir, name] = split(item.path);
        if (!folder || !inFolder(process.cwd(), below(folder, dir), true, () => (create(name, copy), true))) {
          return done('not restored: its changed version could not be saved under .temp/');
        }
      }
      if (!put(item, content)) return done('not restored: a folder on its path is a link');
      return done(copy ? 'restored, the changed version saved' : 'restored');
    } catch (error) {
      return done(`not restored: ${error.code ?? error.message}`);
    }
  });
  return { results, folder };
}
