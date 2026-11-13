// What the template seal of 01-meta-guidelines.md finds in a derived project: whether it applies, which manifest and
// exceptions it follows, and what file tools may not edit; template-seal-drift.mjs finds which sealed files differ.
// It never applies in a checkout of the template, a fork or clone included, which tracks and holds its CI files, nor
// without a committed manifest, nor while .temp/template-adoption marks an adoption in progress. The committed manifest is the reference,
// so an edit to the manifest itself counts as drift; one from another release without the marker looks like an
// adoption begun without it and pauses the seal, as does an unreadable exceptions list, so that nothing is restored on
// a guess. Everything here reads from the repository root.

import { lstatSync, readFileSync } from 'node:fs';
import { git } from './hook-support.mjs';
import { MANIFEST, PROJECT_OWNED, TEMPLATE_MARKERS, VERSION_FILE, isTemplateCheckout, listed, parseManifest, readText, safePath }
  from './template-files.mjs';

export const EXCEPTIONS = '.agents/template-exceptions.json';
export const ADOPTING = '.temp/template-adoption';

const entry = (path) => lstatSync(path, { throwIfNoEntry: false });
// A SHA-1 or SHA-256 object id, so that a manifest value never reaches git as an option.
export const isBlobId = (id) => /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(id);

// The paths the project keeps as its own, or the reason the list cannot be read: a JSON object whose keys are
// relative paths, a folder ending in /, and whose values say why, with a link to the project policy that replaces
// the template's. The manifest and the version change only through an adoption, so no entry may cover them.
export function readExceptions() {
  const stats = entry(EXCEPTIONS);
  if (!stats) return { paths: [] };
  let value;
  try {
    value = stats.isFile() ? JSON.parse(readFileSync(EXCEPTIONS, 'utf8')) : undefined;
  } catch {
    return { error: 'it is not JSON' };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'it is not a JSON object of paths and reasons' };
  for (const [path, reason] of Object.entries(value)) {
    if (!path || !safePath(path)) return { error: `${JSON.stringify(path)} is not a relative path inside the repository` };
    if (listed([path], MANIFEST) || listed([path], VERSION_FILE)) return { error: `${JSON.stringify(path)} covers a file that only an adoption changes` };
    if (typeof reason !== 'string' || !reason.trim()) return { error: `${JSON.stringify(path)} gives no reason` };
  }
  return { paths: Object.keys(value) };
}

// The sealed [path, blob id] pairs of a manifest: its files that are neither project-owned nor excepted, and the
// manifest itself when it is committed.
export const sealedPairs = (manifest, exceptions, manifestId) => [...manifest.files, ...(manifestId ? [[MANIFEST, manifestId]] : [])]
  .filter(([path]) => !listed(PROJECT_OWNED, path) && !listed(exceptions, path));

// The manifest the seal follows, the one HEAD holds, with its id; null where none is committed, as in a template
// unpacked and not yet committed, since only a commit can vouch for the files the seal restores.
function reference() {
  const committedId = git(['rev-parse', '-q', '--verify', `HEAD:${MANIFEST}`])?.trim() || null;
  return { committedId, manifest: committedId ? parseManifest(git(['cat-file', 'blob', committedId])) : null };
}

// Whether the file system holds AGENTS.md under another letter case too, as macOS and Windows do by default.
const foldsCase = () => entry('agents.md')?.ino === entry('AGENTS.md')?.ino && Boolean(entry('AGENTS.md'));

// { mode: 'off' }, { mode: 'adopting', since }, { mode: 'paused', why }, or { mode: 'active', manifest, exceptions,
// sealed }. A repository without a committed manifest never adopted the template.
export function sealState() {
  if (isTemplateCheckout()) return { mode: 'off' };
  const { committedId, manifest: committed } = reference();
  if (!committedId) return { mode: 'off' };
  const marker = entry(ADOPTING);
  if (marker) return { mode: 'adopting', since: marker.mtime.toISOString() };
  const paused = (why) => ({ mode: 'paused', why });
  const exceptions = readExceptions();
  if (exceptions.error) return paused(`${EXCEPTIONS} is not valid (${exceptions.error})`);
  const local = parseManifest(entry(MANIFEST)?.isFile() ? readText(MANIFEST) : null);
  if (!committed) return paused(`the committed ${MANIFEST} is unreadable`);
  if (local && local.version !== committed.version) {
    return paused(`${MANIFEST} comes from another release (${local.version}) than the committed one (${committed.version}), `
      + `as in an adoption begun without ${ADOPTING}`);
  }
  return { mode: 'active', manifest: committed, exceptions: exceptions.paths, sealed: sealedPairs(committed, exceptions.paths, committedId) };
}

// What the seal guards against a write at a path relative to the root of a derived project: 'sealed' for a sealed
// file outside an adoption; for the exceptions list, the adoption marker, and the template CI files that mark a template
// checkout, which pause, narrow, or turn off the seal, 'control',
// or 'control-adopting' during an adoption; or null. Where the file system ignores letter case, so does the match. An
// unreadable exceptions list excepts nothing.
export function sealGuard(written) {
  if (isTemplateCheckout()) return null;
  const { manifest } = reference();
  if (!manifest) return null;
  const fold = foldsCase() ? (text) => text.toLowerCase() : (text) => text;
  const same = (path) => fold(path) === fold(written);
  if ([EXCEPTIONS, ADOPTING, ...TEMPLATE_MARKERS].some(same)) return entry(ADOPTING) ? 'control-adopting' : 'control';
  const path = [MANIFEST, ...manifest.files.keys()].find(same);
  if (!path || listed(PROJECT_OWNED, path) || entry(ADOPTING)) return null;
  const { paths = [] } = readExceptions();
  return listed(paths, path) ? null : 'sealed';
}
