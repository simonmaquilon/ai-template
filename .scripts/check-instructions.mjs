#!/usr/bin/env node
// Reports instruction files and .readme/ documents that break the structure
// 01-meta-guidelines.md and 16-documentation.md set: every file under
// .agents/instructions/ needs an entry in the routing table of AGENTS.md, holds
// at most LIMIT physical lines, heading and blank lines included, and keeps
// each rule on one line, so after its heading every non-blank line is its one
// scope line or a line that starts a rule with "- "; and no two instruction
// files, or two documents directly under .readme/, share a numeric prefix,
// compared by value so 07- and 7- clash, nor reuse the prefix of one the git
// history shows retired; a rename that keeps its prefix retires nothing. A
// routing entry that names a missing file is left to check-doc-links.mjs. Runs
// from any directory of the repository and prints plain text, which the agent
// clients add to the model's context; prints nothing when every file complies
// or outside git.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { enterRepositoryRoot, git } from './hook-support.mjs';

const LIMIT = 25;
const INSTRUCTIONS = join('.agents', 'instructions');
const ROUTING_ENTRY = /^- `(\d+-[\w-]+\.md)`:/gm;

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

// Current names in dir that take the prefix of a file the history retired:
// deleted, or renamed to another prefix, under a different name. A deletion
// and an addition with the same prefix in one commit are a rename, as when a
// rename rewrites the file too much for git to pair them.
function reusedPrefixes(dir, names) {
  const log = git(['log', '--format=%x1e', '--name-status', '-M', '--diff-filter=ADR', '--', dir]) ?? '';
  const retired = [];
  for (const commit of log.split('\x1e')) {
    const entries = commit.split('\n').map((line) => line.split('\t')).filter(([, path]) => path && dirname(path) === dir);
    const arrived = entries.filter(([status]) => status === 'A').map(([, path]) => prefixOf(basename(path)));
    for (const [status, path, renamed] of entries) {
      const moved = status.startsWith('R') && prefixOf(basename(renamed)) !== prefixOf(basename(path));
      if ((status === 'D' && !arrived.includes(prefixOf(basename(path)))) || moved) retired.push(basename(path));
    }
  }
  return names.flatMap((name) =>
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
const routed = new Set([...agents.matchAll(ROUTING_ENTRY)].map(([, name]) => name));
const unrouted = [];
const oversized = [];
const wrapped = [];
for (const name of instructions) {
  if (!routed.has(name)) unrouted.push(name);
  const text = readFileSync(join(INSTRUCTIONS, name), 'utf8');
  const lines = text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  if (lines > LIMIT) oversized.push(`${name} (${lines} lines)`);
  wrapped.push(...wrappedLines(text).map((line) => `${name}:${line}`));
}

const reports = [
  ['Instruction files without a routing entry in AGENTS.md (01-meta-guidelines.md)', unrouted],
  [`Instruction files over ${LIMIT} lines (01-meta-guidelines.md)`, oversized],
  ['Instruction rules wrapped across lines (01-meta-guidelines.md)', wrapped],
  ['Instruction files sharing a numeric prefix (01-meta-guidelines.md)', sharedPrefixes(instructions)],
  ['.readme/ documents sharing a numeric prefix (16-documentation.md)', sharedPrefixes(markdown('.readme'))],
  ['Instruction files reusing the prefix of a retired one (01-meta-guidelines.md)', reusedPrefixes('.agents/instructions', instructions)],
  ['.readme/ documents reusing the prefix of a retired one (16-documentation.md)', reusedPrefixes('.readme', markdown('.readme'))],
];
for (const [title, items] of reports) if (items.length > 0) console.log(`${title}: ${items.join(', ')}`);
