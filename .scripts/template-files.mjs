// Who owns each file the template ships, the one place that says so. The manifest records every tracked file except
// TEMPLATE_ONLY and itself; in a derived project, PROJECT_OWNED files are the project's to fill in or adapt, and every
// other manifest file is sealed: the template seal restores it when it differs (01-meta-guidelines.md). An entry
// ending in / is a directory. Paths and helpers here read from the repository root.

import { lstatSync, readFileSync } from 'node:fs';
import { git } from './hook-support.mjs';

export const MANIFEST = '.agents/template-manifest.json';
export const VERSION_FILE = '.agents/template-version';
export const ADOPTION = '.readme/96-template-adoption.md';

// Files that only validate the template, never adopted.
export const TEMPLATE_ONLY = [
  '.github/workflows/template-checks.yml',
  '.scripts/run-checks.mjs',
  '.scripts/tests/',
  '.scripts/check-security-skill.mjs',
  '.scripts/security-skill-hash.mjs',
  '.readme/94-template-ci.md',
];

// Manifest files a derived project makes its own, so the template seal never compares or restores them.
export const PROJECT_OWNED = [
  '.docs/',
  'README.md',
  '.claude/settings.json',
  '.codex/config.toml',
  '.mcp.json',
  '.readme/91-agent-sandbox.md',
  '.readme/95-agent-tool-servers.md',
  '.gitignore',
  '.gitattributes',
  'skills-lock.json',
];

export const listed = (list, path) => list.some((entry) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry));

// Whether a relative path stays in the repository, avoids .git, and holds no control character.
export const safePath = (path) => !/^[/\\]|^[a-z]:|(^|[/\\])(\.\.|\.git)([/\\]|$)|[\0-\x1f\x7f]/i.test(path);

export const readText = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };

// A manifest read from text, or null unless it holds a version and blob ids by relative path. A release's manifest is
// untrusted, so a path leaving the repository, reaching .git, or holding a control character makes it unreadable.
export function parseManifest(text) {
  try {
    const { version, files } = JSON.parse(text);
    const entries = Object.entries(files);
    const safe = ([path, id]) => typeof id === 'string' && safePath(path);
    return typeof version === 'string' && !Array.isArray(files) && entries.every(safe) ? { version, files: new Map(entries) } : null;
  } catch { return null; }
}

// A remote URL as host/path, so the ssh and https forms of one repository compare equal.
function normalize(url) {
  const text = url.trim().replace(/\/+$/, '').replace(/\.git$/, '').replace(/\/+$/, '');
  const parts = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/]+)\/(.+)$/i.exec(text) ?? /^(?:[^@/:]+@)?([^:/]+):(.+)$/.exec(text);
  return parts ? `${parts[1].toLowerCase()}/${parts[2].replace(/^\/+/, '')}` : text;
}

// Template-only files that no project creates for itself, unlike tests or a run-checks.mjs of its own.
export const TEMPLATE_MARKERS = ['.github/workflows/template-checks.yml', '.readme/94-template-ci.md'];

// The origin recorded in the adoption guide and this repository's, and whether they name the same repository.
function origins() {
  const recorded = /La plantilla mantenida es el repositorio cuyo remoto `origin` apunta a `([^`]+)`/.exec(readText(ADOPTION) ?? '')?.[1];
  const origin = git(['remote', 'get-url', 'origin'])?.trim();
  return { recorded, origin, matches: Boolean(recorded && origin && normalize(origin) === normalize(recorded)) };
}

// Whether this is a checkout of the template, a fork or clone included: HEAD holds a marker that is also on disk, which
// a marker made by hand in a derived project is not, even staged, nor one the start skill deleted; or, under the
// template's own origin, HEAD still holds one that left the disk, as when the maintainer deletes both before committing.
export function isTemplateCheckout() {
  const tracked = (git(['--literal-pathspecs', 'ls-tree', '-r', '-z', '--name-only', 'HEAD', '--', ...TEMPLATE_MARKERS]) ?? '').split('\0').filter(Boolean);
  if (tracked.length === 0) return false;
  return tracked.some((path) => lstatSync(path, { throwIfNoEntry: false })) || origins().matches;
}

// Whether this repository is the maintained template: its origin is the URL the adoption guide records, and it is a
// checkout of the template, which a derived project that kept that origin is not once it deleted the markers.
export function maintainedTemplate() {
  const found = origins();
  return { ...found, maintained: found.matches && isTemplateCheckout() };
}
