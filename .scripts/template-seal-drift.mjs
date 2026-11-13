// Finds which sealed files of a derived project differ from their blob, for the template seal of
// 01-meta-guidelines.md, and which of them may be restored. Content compares by blob id, with .gitattributes
// normalization. The kind (file, executable file, or link) comes from the adopted release's tree when
// refs/plantilla/<version> holds it, as the adoption guide fetches it, else from the index, else from the commit that
// recorded the manifest; with none known, neither the kind nor the executable bit is compared, and the bit never
// counts on Windows or with core.fileMode false. A manifest is only a list of paths and ids, so the seal restores an
// entry only when something else vouches for it: the fetched release ships it with that content or, without the
// release, the commit that recorded the manifest holds it so, as the adoption commit does; and git does not ignore it.
// An edited manifest, committed or not, never makes the seal create or overwrite any other file. Everything here reads
// from the repository root.

import { createHash } from 'node:crypto';
import { lstatSync, readlinkSync } from 'node:fs';
import { git, toPosix } from './hook-support.mjs';
import { MANIFEST, TEMPLATE_ONLY, listed } from './template-files.mjs';

const WINDOWS = process.platform === 'win32';
const entry = (path) => lstatSync(path, { throwIfNoEntry: false });

// Mode and id by path from git ls-tree or ls-files -s output, empty when git fails.
function listing(args) {
  const map = new Map();
  for (const line of (git(args) ?? '').split('\0')) {
    const match = /^(\d{6}) (?:blob |commit |tree )?([0-9a-f]{40,64})(?: \d)?\t([^]*)$/.exec(line);
    if (match) map.set(match[3], { mode: match[1], id: match[2] });
  }
  return map;
}

// The adopted release's ref when the local git repository holds it, or null; asked of git once per run.
const refs = new Map();
function releaseRef(version) {
  if (!refs.has(version)) {
    const ref = /^\d+\.\d+\.\d+$/.test(version ?? '') ? `refs/plantilla/${version}` : null;
    refs.set(version, ref && git(['rev-parse', '-q', '--verify', `${ref}^{tree}`]) ? ref : null);
  }
  return refs.get(version);
}

// The blob id of a link's target text, computed as git does for an object id of that length.
const linkId = (text, id) => createHash(id.length === 64 ? 'sha256' : 'sha1')
  .update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');

// What can vouch for these paths: the release's entries, when fetched, and, read only when first asked, because
// finding it walks the history, those of the last commit that changed the manifest; and a function that says why an
// entry lacks a voucher, or null when it has one.
function vouchers(paths, version) {
  const tree = (ref) => listing(['--literal-pathspecs', 'ls-tree', '-r', '-z', ref, '--', ...paths]);
  const ref = releaseRef(version);
  const release = ref ? tree(ref) : null;
  let entries;
  const recorded = (path) => (entries ??= tree(git(['log', '-1', '--format=%H', '--', MANIFEST])?.trim() || 'HEAD')).get(path);
  const why = ({ path, id }) => (release ? (release.get(path)?.id === id ? null : `${ref} does not ship it with that content`)
    : recorded(path)?.id === id ? null : `the commit that recorded ${MANIFEST} does not hold it with that content`);
  return { release, recorded, why };
}

// 'dir' when every folder above a path is a real directory, 'missing' when one does not exist, 'unsafe' when one is a
// link or a file, so that no check or restore goes through it.
function folders(path, cache) {
  const parts = path.split('/').slice(0, -1);
  for (let i = 1; i <= parts.length; i++) {
    const folder = parts.slice(0, i).join('/');
    if (!cache.has(folder)) {
      const stats = entry(folder);
      cache.set(folder, !stats ? 'missing' : stats.isDirectory() ? 'dir' : 'unsafe');
    }
    if (cache.get(folder) !== 'dir') return cache.get(folder);
  }
  return 'dir';
}

// The sealed entries that differ from their blob, as { path, id, want, change, current, unsafe, untrusted }: want is
// the expected kind (link, exec, file, or null when unknown), current the kind found when it can be saved, unsafe a
// path no step may go through, and untrusted why the seal may not restore it.
export function findDrift(sealed, version) {
  const paths = sealed.map(([path]) => path);
  const index = listing(['--literal-pathspecs', 'ls-files', '-s', '-z', '--', ...paths]);
  const { release, recorded, why } = vouchers(paths, version);
  const bits = !WINDOWS && git(['config', '--bool', 'core.fileMode'])?.trim() !== 'false';
  const cache = new Map();
  const found = [];
  const files = [];
  for (const [path, id] of sealed) {
    const mode = (release?.get(path) ?? index.get(path) ?? recorded(path))?.mode;
    const item = { path, id, want: mode === '120000' ? 'link' : mode === '100755' ? 'exec' : mode ? 'file' : null };
    const state = /^"/.test(path) ? 'unsafe' : folders(path, cache);
    const stats = state === 'dir' ? entry(path) : undefined;
    if (state === 'unsafe') found.push({ ...item, change: 'a folder on its path is a link or a file', unsafe: true });
    else if (!stats) found.push({ ...item, change: 'deleted' });
    else if (stats.isSymbolicLink() && item.want && item.want !== 'link') found.push({ ...item, change: 'replaced by a symbolic link', current: 'link' });
    else if (stats.isSymbolicLink()) {
      const changed = linkId(toPosix(readlinkSync(path)), id) !== id;
      if (changed) found.push({ ...item, change: 'symbolic link changed', current: 'link' });
    } else if (stats.isFile()) files.push([item, stats]);
    else found.push({ ...item, change: 'not a file or a link', unsafe: true });
  }
  const hashed = files.length > 0 ? git(['hash-object', '--stdin-paths'], `${files.map(([item]) => item.path).join('\n')}\n`)?.split('\n') : [];
  if (!hashed) throw new Error('git hash-object failed');
  files.forEach(([item, stats], i) => {
    const executable = (stats.mode & 0o100) !== 0;
    const change = hashed[i] !== item.id ? (item.want === 'link' ? 'the symbolic link was replaced by a file' : 'content changed')
      : bits && (item.want === 'exec' || item.want === 'file') && executable !== (item.want === 'exec') ? 'executable bit changed' : null;
    if (change) found.push({ ...item, change, current: 'file' });
  });
  const candidates = found.filter((item) => !item.unsafe && !index.has(item.path)).map((item) => item.path);
  const ignored = new Set(candidates.length > 0 ? (git(['check-ignore', '-z', '--stdin'], `${candidates.join('\0')}\0`) ?? '').split('\0') : []);
  for (const item of found) {
    if (!item.unsafe) item.untrusted = why(item) ?? (ignored.has(item.path) ? 'git ignores it' : undefined);
  }
  return found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// The sealed pairs nothing vouches for, as { path, untrusted }, which --adoption-end refuses.
export function unvouched(sealed, version) {
  const { why } = vouchers(sealed.map(([path]) => path), version);
  return sealed.map(([path, id]) => ({ path, untrusted: why({ path, id }) })).filter((item) => item.untrusted);
}

// The files the fetched release ships that the manifest leaves out, other than the template-only ones, or [].
export function unlisted(manifest) {
  const ref = releaseRef(manifest.version);
  if (!ref) return [];
  return [...listing(['ls-tree', '-r', '-z', ref]).keys()]
    .filter((path) => path !== MANIFEST && !manifest.files.has(path) && !listed(TEMPLATE_ONLY, path)).sort();
}
