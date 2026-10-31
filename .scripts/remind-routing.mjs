#!/usr/bin/env node
// Reminds the model, on every turn, of the instruction modules that the routing
// table of AGENTS.md routes to, listing only their paths, so the rule to load
// each one whose condition matches the request stays in view; AGENTS.md itself
// states when each applies. Reads AGENTS.md on every run, so the reminder never
// drifts from the table, and keeps no state. Prints plain text, which the agent
// clients add to the model's context; prints nothing without routing entries,
// outside git, or in another repository, such as an independent project nested
// in this one.
//
//   node .scripts/remind-routing.mjs

import { existsSync, readFileSync } from 'node:fs';
import { enterRepositoryRoot } from './hook-support.mjs';

const ROUTING_ENTRY = /^- `(\d+-[\w-]+\.md)`:/gm;

if (!enterRepositoryRoot() || !existsSync('AGENTS.md')) process.exit(0);
const entries = [...readFileSync('AGENTS.md', 'utf8').matchAll(ROUTING_ENTRY)];
if (entries.length === 0) process.exit(0);

const paths = entries.map(([, name]) => `.agents/instructions/${name}`);
console.log('Instruction routing (AGENTS.md): before acting, load every module below whose condition matches '
  + `this request; AGENTS.md states when each applies.\n${paths.join('\n')}`);
