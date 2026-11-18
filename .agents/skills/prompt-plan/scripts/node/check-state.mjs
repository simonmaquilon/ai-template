// Fingerprints the project and plan inputs without running check scripts or git diff drivers.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readlinkSync, readSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// The hook pins evidence directories below the template repository. The portable copy has no template dependencies.
const bundled = fileURLToPath(import.meta.url).endsWith('check-state.mjs');
const bundleRoot = bundled ? fileURLToPath(new URL('../../../../../', import.meta.url)) : null;
const safeFs = bundled ? await import('../../../../../.scripts/safe-fs.mjs') : null;
const METADATA_LIMIT = 1024 ** 2;
export const BEFORE_LIMIT = 32 * METADATA_LIMIT;
const LOG_LIMIT = 64 * METADATA_LIMIT;
const READ_FLAGS = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0);

export const NUMBER = /^(?:0[1-9]|[1-9]\d)$/;
export const HASH = /^[a-f0-9]{64}$/;
export const STAMP = '\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z';
export const RUN_ID = new RegExp(`^${STAMP}-[a-f0-9]{32}$`);
export const CHECK_LOG = new RegExp(`^\\d{2}-check-${STAMP}\\.log$`);
export const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const hashBytes = (value) => createHash('sha256').update(value).digest('hex');

export function pathParts(path) {
  if (typeof path !== 'string' || path.includes('\\') || isAbsolute(path)) throw new Error('Invalid relative path.');
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || /[:\0]/.test(part))) throw new Error('Invalid relative path.');
  return parts;
}

const inside = (parent, file) => {
  const path = relative(parent, file);
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
};

// Refuse a symlink at any point below the caller's trusted root.
export function localEntry(root, path, { obstructedIsMissing = false } = {}) {
  let file = root;
  let info;
  const parts = pathParts(path);
  for (const [i, part] of parts.entries()) {
    file = join(file, part);
    info = lstatSync(file, { throwIfNoEntry: false });
    if (!info) return null;
    if (i < parts.length - 1 && !info.isDirectory()) {
      if (obstructedIsMissing) return null;
      throw new Error('Evidence path leaves its directory.');
    }
  }
  return { file, info };
}

function readFolder(root, parts, work) {
  if (!safeFs) return work(join(root, ...parts));
  if (!inside(bundleRoot, root)) throw new Error('Evidence is outside the repository.');
  const segments = relative(bundleRoot, root).split(sep).filter(Boolean);
  const folder = [...segments, ...parts].join('/') || '.';
  const result = safeFs.inFolder(bundleRoot, folder, false, () => work('.'));
  if (result === undefined) throw new Error('Evidence directory changed during inspection.');
  return result;
}

const unchanged = (before, after) => after && before.ino === after.ino && before.dev === after.dev
  && before.size === after.size && before.mode === after.mode && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs;

function readRegular(root, path, limit, read) {
  const entry = localEntry(root, path);
  if (!entry) return null;
  if (!entry.info.isFile()) throw new Error('Expected a regular file.');
  const parts = pathParts(path);
  const name = parts.pop();
  return readFolder(root, parts, (folder) => {
    const file = join(folder, name);
    const fd = safeFs ? safeFs.openRegular(file, constants.O_RDONLY) : openSync(file, READ_FLAGS);
    try {
      const opened = fstatSync(fd);
      if (!opened.isFile() || !unchanged(entry.info, opened)) throw new Error('Evidence file changed while opening.');
      if (opened.size > limit) throw new Error('Evidence file exceeds its size limit.');
      const result = read(fd, opened.size);
      if (!unchanged(opened, fstatSync(fd)) || !unchanged(opened, lstatSync(file, { throwIfNoEntry: false }))) {
        throw new Error('Evidence file changed while reading.');
      }
      return result;
    } finally {
      closeSync(fd);
    }
  });
}

function readChunk(fd, buffer, offset, length) {
  const read = readSync(fd, buffer, offset, length, null);
  if (!read) throw new Error('Evidence ended while reading.');
  return read;
}

export function readLocal(root, path, limit = METADATA_LIMIT) {
  return readRegular(root, path, limit, (fd, size) => {
    const bytes = Buffer.allocUnsafe(size);
    for (let offset = 0; offset < size;) offset += readChunk(fd, bytes, offset, size - offset);
    return bytes;
  });
}

export function readLog(root, path) {
  return readRegular(root, path, LOG_LIMIT, (fd, size) => {
    const hash = createHash('sha256');
    const bytes = Buffer.allocUnsafe(Math.min(size, 64 * 1024));
    const tail = Buffer.allocUnsafe(Math.min(size, 64));
    const tailStart = size - tail.length;
    for (let offset = 0; offset < size;) {
      const length = readChunk(fd, bytes, 0, Math.min(bytes.length, size - offset));
      hash.update(bytes.subarray(0, length));
      const start = Math.max(offset, tailStart);
      if (start < offset + length) bytes.copy(tail, start - tailStart, start - offset, length);
      offset += length;
    }
    return { sha256: hash.digest('hex'), tail };
  });
}

export function localNames(root, path) {
  const entry = localEntry(root, path);
  if (!entry) return [];
  if (!entry.info.isDirectory()) throw new Error('Expected a regular directory.');
  return readFolder(root, pathParts(path), (folder) => readdirSync(folder).sort());
}

const git = (cwd, args, optional = false) => {
  const result = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...args], {
    cwd, maxBuffer: 1024 ** 3, timeout: 30000,
  });
  if (optional && result.status === 1) return '';
  if (result.status !== 0) throw new Error('Unable to read git state.');
  const output = result.stdout.toString();
  if (!Buffer.from(output).equals(result.stdout)) throw new Error('Unsupported git path encoding.');
  return output;
};

function fileState(file, info) {
  if (info.isSymbolicLink()) return ['link', hashBytes(readlinkSync(file, { encoding: 'buffer' }))];
  if (!info.isFile()) throw new Error('Unsupported working-tree entry.');
  const fd = openSync(file, READ_FLAGS);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.ino !== info.ino || stat.dev !== info.dev) throw new Error('File changed while opening.');
    const hash = createHash('sha256');
    const bytes = Buffer.allocUnsafe(64 * 1024);
    let length;
    while ((length = readSync(fd, bytes, 0, bytes.length, null))) hash.update(bytes.subarray(0, length));
    const after = fstatSync(fd);
    if (stat.size !== after.size || stat.mode !== after.mode || stat.mtimeMs !== after.mtimeMs || stat.ctimeMs !== after.ctimeMs) throw new Error('File changed while reading.');
    return [info.mode & 0o777, hash.digest('hex')];
  } finally {
    closeSync(fd);
  }
}

function indexedPaths(root) {
  const entries = new Map();
  for (const line of git(root, ['ls-files', '--stage', '-z']).split('\0').filter(Boolean)) {
    const tab = line.indexOf('\t');
    const name = line.slice(tab + 1);
    const values = entries.get(name) ?? [];
    values.push(line.slice(0, tab));
    entries.set(name, values);
  }
  for (const line of git(root, ['ls-files', '-v', '-z']).split('\0').filter(Boolean)) entries.get(line.slice(2)).push(line.slice(0, 1));
  for (const name of git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)) {
    if (!entries.has(name)) entries.set(name, []);
  }
  return entries;
}

export function captureProject(root, planDir, { cache = false } = {}) {
  try {
    if (resolve(git(root, ['rev-parse', '--show-toplevel']).trimEnd()) !== resolve(root)) return null;
    const revision = git(root, ['rev-parse', '--verify', '-q', 'HEAD'], true).trim() || null;
    const basis = fingerprint([revision, git(root, ['symbolic-ref', '-q', 'HEAD'], true),
      git(root, ['for-each-ref', '--format=%(refname)%00%(objectname)%00%(symref)'])]);
    const names = indexedPaths(root);
    const files = [];
    for (const name of [...names.keys()].sort()) {
      if (planDir && inside(planDir, join(root, name))) continue;
      const index = names.get(name);
      const entry = localEntry(root, name.replace(/\/$/, ''), { obstructedIsMissing: true });
      let working = null;
      if (entry?.info.isDirectory() && index.some((value) => value.startsWith('160000 '))) {
        const nested = captureProject(entry.file, planDir, { cache });
        if (!nested) return null;
        // Interim caching keeps its existing restriction against reusing a dirty nested repository.
        if (cache && git(entry.file, ['status', '--porcelain', '--untracked-files=all'])) return null;
        working = ['submodule', projectFingerprint(nested)];
      } else if (entry && (!entry.info.isDirectory() || index.length === 0)) {
        working = fileState(entry.file, entry.info);
      }
      files.push([name, fingerprint([index, working])]);
    }
    return { basis, files, revision };
  } catch {
    return null;
  }
}

export function projectFingerprint(snapshot, exclude = []) {
  if (!snapshot || !HASH.test(snapshot.basis) || !Array.isArray(snapshot.files)
    || snapshot.files.some((entry) => !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !HASH.test(entry[1]))) return null;
  return fingerprint([snapshot.basis, snapshot.files.filter(([name]) => !exclude.includes(name))]);
}

export function buildChecks(planDir) {
  const fragments = new Map();
  for (const name of localNames(planDir, 'build').filter((part) => /^\d{2}-.+\.md$/.test(part) && NUMBER.test(part.slice(0, 2)))) {
    const number = name.slice(0, 2);
    const body = readLocal(planDir, `build/${name}`).toString('utf8');
    if (fragments.has(number)) throw new Error('Repeated fragment number.');
    fragments.set(number, { name, required: /^<!-- check: required -->\s*$/m.test(body), final: /^<!-- check: final -->\s*$/m.test(body) });
  }
  return fragments;
}

export function declaredTestPaths(planDir, number) {
  const fragment = buildChecks(planDir).get(number);
  if (!fragment) throw new Error('No build fragment matches this tests-before record.');
  const body = readLocal(planDir, `build/${fragment.name}`).toString('utf8');
  const paths = [...body.matchAll(/^<!-- test-path: (.+) -->\s*$/gm)].map(([, name]) => {
    pathParts(name);
    return name;
  });
  if (new Set(paths).size !== paths.length) throw new Error('Repeated test path declaration.');
  return paths.sort();
}

export function requiredChecks(planDir) {
  const scripts = localNames(planDir, 'check').filter((name) => /^\d{2}-check\.mjs$/.test(name) && NUMBER.test(name.slice(0, 2)));
  const marked = [...buildChecks(planDir)].filter(([, fragment]) => fragment.required).map(([number]) => `${number}-check.mjs`);
  return [...new Set([...scripts, ...marked])].sort();
}

export function checkFiles(planDir, path = 'check') {
  return localNames(planDir, path).flatMap((name) => {
    const child = `${path}/${name}`;
    if (child === 'build/00-index.md') return [];
    const { info } = localEntry(planDir, child);
    return info.isDirectory() ? checkFiles(planDir, child) : [[child, readLocal(planDir, child), info.mode & 0o777]];
  });
}

export function checkFingerprint(planDir, files = checkFiles(planDir)) {
  const inputs = [...files, ...checkFiles(planDir, 'build')];
  return fingerprint([inputs.map(([name, bytes, mode]) => [name, hashBytes(bytes), mode]), requiredChecks(planDir)]);
}

export function captureIdentity(root, planDir) {
  try {
    const snapshot = captureProject(root, planDir);
    const project = projectFingerprint(snapshot);
    if (!project) return null;
    const checks = checkFingerprint(planDir);
    return { revision: snapshot.revision, project, checks, combined: fingerprint([project, checks]) };
  } catch {
    return null;
  }
}

export const captureState = (root, planDir) => captureIdentity(root, planDir)?.combined ?? null;
