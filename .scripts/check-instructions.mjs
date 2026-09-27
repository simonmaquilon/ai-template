#!/usr/bin/env node
// Reports instruction files that break the structure 01-meta-guidelines.md
// sets: every file under .agents/instructions/ needs an entry in the routing
// table of AGENTS.md, and none may exceed LIMIT physical lines, heading and
// blank lines included. A routing entry that names a missing file is left to
// check-doc-links.mjs. Runs from any directory of the repository and prints
// plain text, which the agent clients add to the model's context; prints
// nothing when every file complies, when there are no instructions, or outside
// git.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { enterRepositoryRoot } from './hook-support.mjs';

const LIMIT = 25;
const INSTRUCTIONS = join('.agents', 'instructions');
const ROUTING_ENTRY = /^- `(\d+-[\w-]+\.md)`:/gm;

if (!enterRepositoryRoot() || !existsSync(INSTRUCTIONS)) process.exit(0);

const agents = existsSync('AGENTS.md') ? readFileSync('AGENTS.md', 'utf8') : '';
const routed = new Set([...agents.matchAll(ROUTING_ENTRY)].map(([, name]) => name));
const unrouted = [];
const oversized = [];
for (const name of readdirSync(INSTRUCTIONS).filter((entry) => entry.endsWith('.md')).sort()) {
  if (!routed.has(name)) unrouted.push(name);
  const text = readFileSync(join(INSTRUCTIONS, name), 'utf8');
  const lines = text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  if (lines > LIMIT) oversized.push(`${name} (${lines} lines)`);
}

if (unrouted.length > 0) {
  console.log(`Instruction files without a routing entry in AGENTS.md (01-meta-guidelines.md): ${unrouted.join(', ')}`);
}
if (oversized.length > 0) {
  console.log(`Instruction files over ${LIMIT} lines (01-meta-guidelines.md): ${oversized.join(', ')}`);
}
