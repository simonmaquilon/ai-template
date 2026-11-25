#!/usr/bin/env node
// Reports instruction files and .readme/ documents that break the structure
// 01-meta-guidelines.md and 10-documents.md set: AGENTS.md holds at most
// AGENTS_LIMIT bytes; every file under .agents/instructions/ needs an entry in
// the routing table of AGENTS.md, holds at most MODULE_LIMIT bytes, and keeps
// each rule on one line, so after its heading every non-blank line is its one
// scope line or a line that starts a rule with "- "; whose scope line is
// "Read " and the condition of its routing entry; and no two instruction
// files, or two documents directly under .readme/, share a numeric prefix,
// compared by value so 07- and 7- clash, nor reuse the prefix of one the git
// history shows retired; a rename that keeps its prefix retires nothing, and
// neither does a project's history up to the commit that first added
// .agents/template-version, whose files belonged to the set the baseline
// replaced on adoption. Outside a checkout of the template, a file the template
// manifest lists is never reported as reusing a retired prefix: the template
// owns its prefix, and the project cannot resolve it. A routing entry that
// names a missing file is left to check-doc-links.mjs. Runs from any directory
// of the repository and prints plain text, which the agent clients add to the
// model's context; prints nothing when every file complies, outside git, or in
// another repository.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { enterRepositoryRoot, git } from './hook-support.mjs';
import { MANIFEST, isTemplateCheckout, parseManifest, readText } from './template-files.mjs';

const AGENTS_LIMIT = 10 * 1024;
const MODULE_LIMIT = 6 * 1024;
const INSTRUCTIONS = join('.agents', 'instructions');
const TEMPLATE_VERSION = '.agents/template-version';
const ROUTING_ENTRY = /^- `(\d+-[\w-]+\.md)`:(.*?)\r?$/gm;

if (!enterRepositoryRoot()) process.exit(0);

const markdown = (dir) => (existsSync(dir) ? readdirSync(dir).filter((entry) => entry.endsWith('.md')).sort() : []);

const prefixOf = (name) => (/^(\d+)-/.test(name) ? Number(/^(\d+)-/.exec(name)[1]) : null);

// Groups of file names that share a numeric prefix.
function sharedPrefixes(names) {
  const byPrefix = new Map();
  for (const name of names) {
    const prefix = prefixOf(name);
    if (prefix !== null) byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), name]);
  }
  return [...byPrefix.values()].filter((group) => group.length > 1).map((group) => group.join(' and '));
}

// The history that governs prefixes: the commits after the one that first
// added .agents/template-version, which adopted the baseline and may replace
// the project's earlier files; all of it when the file was never added; none
// while an adoption is still uncommitted.
function governedHistory() {
  const added = git(['log', '--diff-filter=A', '--format=%H', '--', TEMPLATE_VERSION])?.trim();
  if (added) return [`${added.split('\n').at(-1)}..HEAD`];
  return existsSync(TEMPLATE_VERSION) ? null : [];
}

// Current names in dir that take the prefix of a file the history retired:
// deleted, or renamed to another prefix, under a different name. A deletion
// and an addition with the same prefix in one commit are a rename, as when a
// rename rewrites the file too much for git to pair them. Outside a checkout of
// the template, the names the template manifest lists in dir are left out; with
// no readable manifest, none is.
function reusedPrefixes(dir, names) {
  const range = governedHistory();
  if (range === null) return [];
  const log = git(['log', ...range, '--format=%x1e', '--name-status', '-M', '--diff-filter=ADR', '--', dir]) ?? '';
  const retired = [];
  for (const commit of log.split('\x1e')) {
    const entries = commit.split('\n').map((line) => line.split('\t')).filter(([, path]) => path && dirname(path) === dir);
    const arrived = entries.filter(([status]) => status === 'A').map(([, path]) => prefixOf(basename(path)));
    for (const [status, path, renamed] of entries) {
      const moved = status.startsWith('R') && prefixOf(basename(renamed)) !== prefixOf(basename(path));
      if ((status === 'D' && !arrived.includes(prefixOf(basename(path)))) || moved) retired.push(basename(path));
    }
  }
  if (retired.length === 0) return [];
  const manifest = isTemplateCheckout() ? null : parseManifest(readText(MANIFEST) ?? '');
  const sealed = new Set([...(manifest?.files.keys() ?? [])].filter((path) => dirname(path) === dir).map((path) => basename(path)));
  return names.filter((name) => !sealed.has(name)).flatMap((name) =>
    retired.filter((old) => old !== name && prefixOf(old) !== null && prefixOf(old) === prefixOf(name)).map((old) => `${name} (retired ${old})`),
  );
}

// Lines, numbered from 1, that continue a rule or the scope line instead of
// starting one.
function wrappedLines(text) {
  const lines = text.split(/\r?\n/);
  const wrapped = [];
  let scope = false;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '' || lines[i].startsWith('- ')) continue;
    if (!scope && !/^\s/.test(lines[i]) && lines[i - 1].trim() === '') scope = true;
    else wrapped.push(i + 1);
  }
  return wrapped;
}

const instructions = markdown(INSTRUCTIONS);
const agents = existsSync('AGENTS.md') ? readFileSync('AGENTS.md', 'utf8') : '';
const routed = new Map([...agents.matchAll(ROUTING_ENTRY)].map(([, name, condition]) => [name, condition]));
const unrouted = [];
const oversized = [];
const wrapped = [];
const mismatched = [];
for (const name of instructions) {
  if (!routed.has(name)) unrouted.push(name);
  const text = readFileSync(join(INSTRUCTIONS, name), 'utf8');
  // The scope line is the first non-blank line after the title; it must read "Read " and the entry's condition.
  const scope = text.split(/\r?\n/).slice(1).find((line) => line.trim() !== '');
  if (routed.has(name) && scope !== `Read${routed.get(name)}`) mismatched.push(name);
  const bytes = Buffer.byteLength(text);
  if (bytes > MODULE_LIMIT) oversized.push(`${name} (${bytes} bytes)`);
  wrapped.push(...wrappedLines(text).map((line) => `${name}:${line}`));
}

const reports = [
  ['Instruction files without a routing entry in AGENTS.md (01-meta-guidelines.md)', unrouted],
  ['Instruction files whose scope line differs from their routing entry in AGENTS.md (01-meta-guidelines.md)', mismatched],
  [`AGENTS.md over ${AGENTS_LIMIT} bytes (01-meta-guidelines.md)`, Buffer.byteLength(agents) > AGENTS_LIMIT ? [`${Buffer.byteLength(agents)} bytes`] : []],
  [`Instruction files over ${MODULE_LIMIT} bytes (01-meta-guidelines.md)`, oversized],
  ['Instruction rules wrapped across lines (01-meta-guidelines.md)', wrapped],
  ['Instruction files sharing a numeric prefix (01-meta-guidelines.md)', sharedPrefixes(instructions)],
  ['.readme/ documents sharing a numeric prefix (10-documents.md)', sharedPrefixes(markdown('.readme'))],
  ['Instruction files reusing the prefix of a retired one (01-meta-guidelines.md)', reusedPrefixes('.agents/instructions', instructions)],
  ['.readme/ documents reusing the prefix of a retired one (10-documents.md)', reusedPrefixes('.readme', markdown('.readme'))],
];
for (const [title, items] of reports) if (items.length > 0) console.log(`${title}: ${items.join(', ')}`);
