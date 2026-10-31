#!/usr/bin/env node
// Records the content hash of every file the template owns, so a project derived from it can tell, per file,
// whether it modified what it adopted. The template owns every tracked file except those that only validate it
// (TEMPLATE_ONLY) and the manifest itself. A hash is the git blob id of the working-tree content, as
// `git hash-object` gives it, so .gitattributes normalization applies; a symlink hashes its target text. Runs from
// any directory of the repository. Exit status: 0 on success, 1 on a failed check, a refused mode, or a missing or
// unreadable manifest, 2 on misuse.
//
//   node .scripts/template-manifest.mjs --write          regenerate .agents/template-manifest.json, only in the
//                                                        maintained template that the adoption guide names
//   node .scripts/template-manifest.mjs --check          exit 1 when the manifest is not what --write would give
//   node .scripts/template-manifest.mjs --compare <ref>  in a derived project, classify each file against the new
//                                                        release's manifest at <ref> as take, merge, add, delete or
//                                                        review; --check and --compare only read

import { lstatSync, readFileSync, readlinkSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { enterRepositoryRoot, git, toPosix } from './hook-support.mjs';

// Files that only validate the template, never adopted; an entry ending in / is a directory.
export const TEMPLATE_ONLY = [
  '.github/workflows/template-checks.yml',
  '.scripts/run-checks.mjs',
  '.scripts/tests/',
  '.scripts/check-security-skill.mjs',
  '.scripts/security-skill-hash.mjs',
  '.readme/94-template-ci.md',
];
const MANIFEST = '.agents/template-manifest.json';
const VERSION_FILE = '.agents/template-version';
const ADOPTION = '.readme/96-template-adoption.md';

function fail(message, status = 1) {
  console.error(message);
  process.exit(status);
}

const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };
const render = ({ version, files }) => `${JSON.stringify({ version, files: Object.fromEntries(files) }, null, 2)}\n`;

// A manifest read from text, or null unless it holds a version and blob ids by relative path. A release's manifest is
// untrusted, so a path leaving the repository, reaching .git, or holding a control character makes it unreadable.
function parse(text) {
  try {
    const { version, files } = JSON.parse(text);
    const entries = Object.entries(files);
    const safe = ([path, id]) => typeof id === 'string' && !/^[/\\]|^[a-z]:|(^|[/\\])(\.\.|\.git)([/\\]|$)|[\0-\x1f\x7f]/i.test(path);
    return typeof version === 'string' && !Array.isArray(files) && entries.every(safe) ? { version, files: new Map(entries) } : null;
  } catch { return null; }
}

// Blob ids of the working-tree content of these paths, null where there is no file or link. Files go through one
// batched git call; a link goes through one call of its own, because git reads a single object from stdin, and the
// template holds one link.
function hashPaths(paths) {
  const ids = new Map();
  const files = [];
  for (const path of paths) {
    const stats = lstatSync(path, { throwIfNoEntry: false });
    if (stats?.isSymbolicLink()) ids.set(path, git(['hash-object', '--stdin'], toPosix(readlinkSync(path)))?.trim());
    else if (stats?.isFile() && /\n|^"/.test(path)) fail(`Cannot hash ${JSON.stringify(path)}: git reads one path per line`);
    else if (stats?.isFile()) files.push(path);
    else ids.set(path, null);
  }
  const hashed = files.length > 0 ? git(['hash-object', '--stdin-paths'], `${files.join('\n')}\n`)?.split('\n') : [];
  if (!hashed || [...ids.values()].includes(undefined)) fail('git hash-object failed');
  files.forEach((path, i) => ids.set(path, hashed[i]));
  return ids;
}

// The manifest of this working tree: the tracked files the template owns, sorted by code unit.
function current() {
  const version = read(VERSION_FILE)?.trim() || fail(`${VERSION_FILE} is missing or empty`);
  const listed = git(['ls-files', '-z']) ?? fail('git ls-files failed');
  const only = (path) => TEMPLATE_ONLY.some((entry) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry));
  const ids = hashPaths(listed.split('\0').filter((path) => path && path !== MANIFEST && !only(path)));
  return { version, files: new Map([...ids].filter(([, id]) => id).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) };
}

// A remote URL as host/path, so the ssh and https forms of one repository compare equal.
function normalize(url) {
  const text = url.trim().replace(/\/+$/, '').replace(/\.git$/, '').replace(/\/+$/, '');
  const parts = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/]+)\/(.+)$/i.exec(text) ?? /^(?:[^@/:]+@)?([^:/]+):(.+)$/.exec(text);
  return parts ? `${parts[1].toLowerCase()}/${parts[2].replace(/^\/+/, '')}` : text;
}

function write() {
  const recorded = /La plantilla mantenida es el repositorio cuyo remoto `origin` apunta a `([^`]+)`/.exec(read(ADOPTION) ?? '')?.[1];
  if (!recorded) fail(`${ADOPTION} does not record the maintained template's URL, so --write cannot tell whether this is it`);
  const origin = git(['remote', 'get-url', 'origin'])?.trim();
  if (!origin || normalize(origin) !== normalize(recorded)) {
    fail(`--write is allowed only in the maintained template, whose origin is ${recorded}; here origin is ${origin || 'not set'}, ` +
      `so the manifest this project adopted stays as it is`);
  }
  const manifest = current();
  writeFileSync(MANIFEST, render(manifest));
  console.log(`Wrote ${MANIFEST}: version ${manifest.version}, ${manifest.files.size} files`);
}

function check() {
  const text = read(MANIFEST);
  const recorded = parse(text);
  if (!recorded) fail(`${MANIFEST} is missing or unreadable; regenerate it with node .scripts/template-manifest.mjs --write`);
  const now = current();
  const lines = recorded.version === now.version ? [] : [`version: the manifest says ${recorded.version}, ${VERSION_FILE} says ${now.version}`];
  for (const path of [...new Set([...recorded.files.keys(), ...now.files.keys()])].sort()) {
    const [was, is] = [recorded.files.get(path), now.files.get(path)];
    if (was !== is) lines.push(`${was === undefined ? 'added' : is === undefined ? 'removed' : 'changed'}: ${path}`);
  }
  if (lines.length === 0 && text !== render(now)) lines.push(`format: ${MANIFEST} is not laid out as --write lays it out`);
  if (lines.length > 0) {
    console.log(`${MANIFEST} is out of date:\n${lines.join('\n')}`);
    process.exit(1);
  }
}

// What a project does with a path, given its hash in the adopted release, the new release, and the working tree
// (null where absent): identical to the new release or changed only here need nothing.
function classify(adopted, upstream, local) {
  if (local === upstream) return 'identical';
  if (upstream === adopted) return 'local';
  if (local === adopted) return adopted === null ? 'add' : upstream === null ? 'delete' : 'take';
  return local === null || upstream === null ? 'review' : 'merge';
}

function compare(ref) {
  const adopted = parse(read(MANIFEST));
  if (!adopted) fail(`${MANIFEST} is missing or unreadable here, so there is no adopted release to compare from`);
  const upstream = parse(git(['show', `${ref}:${MANIFEST}`]));
  if (!upstream) fail(`${ref} holds no readable ${MANIFEST}`);
  const paths = [...new Set([...adopted.files.keys(), ...upstream.files.keys()])].sort();
  const local = hashPaths(paths);
  const groups = { take: [], merge: [], add: [], delete: [], review: [], identical: [], local: [] };
  for (const path of paths) groups[classify(adopted.files.get(path) ?? null, upstream.files.get(path) ?? null, local.get(path))].push(path);
  console.log(`adopted version: ${adopted.version}\nnew version: ${upstream.version}`);
  for (const action of ['take', 'merge', 'add', 'delete', 'review']) for (const path of groups[action]) console.log(`${action} ${path}`);
  console.log(`no action: ${groups.identical.length} identical to the new release, ${groups.local.length} changed only in this project`);
}

function main([mode, ref, ...rest]) {
  const valid = mode === '--compare' ? ref && !ref.startsWith('-') && rest.length === 0 : ['--write', '--check'].includes(mode) && !ref;
  if (!valid) fail('Usage: node .scripts/template-manifest.mjs --write | --check | --compare <ref>', 2);
  if (!enterRepositoryRoot()) fail('Not inside a git repository');
  if (mode === '--write') write();
  else if (mode === '--check') check();
  else compare(ref);
}

// Runs only when started as a script, so that importing TEMPLATE_ONLY does not run it.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main(process.argv.slice(2));
