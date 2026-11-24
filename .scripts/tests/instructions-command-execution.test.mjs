// The command-execution rules, background processes included, live in their own module, 16-command-execution.md, routed
// after 15 and loaded by every normal change, and neither 04-validation-and-testing.md nor AGENTS.md holds them.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT } from './support.mjs';

const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const MODULE = '.agents/instructions/16-command-execution.md';
const CONDITION = 'before running a check, a long command, a background process, or a command the client settings exempt from the sandbox.';
const MOVED = [
  '- Run checks and long commands so that only their outcome',
  '- Run a command the client settings exempt from the sandbox alone',
  '- A command the environment blocked never ran:',
];
const BACKGROUND = '- Start a background process, such as a server, a log follower, a watcher, or a wait loop, only with a timeout or a stop the task controls, '
  + 'bound every wait with a time limit, and stop every one you started before reporting, above all any that cannot end on its own.';

test('the module is titled, scoped like its routing entry and holds the three moved rules', () => {
  const lines = read(MODULE).split('\n');
  assert.equal(lines[0], '# Command Execution');
  assert.equal(lines[2], `Read ${CONDITION}`);
  for (const rule of MOVED) assert.equal(lines.filter((line) => line.startsWith(rule)).length, 1, rule);
});

test('the background-process rule lives in the module, whole, and no longer in AGENTS.md', () => {
  assert.equal(read(MODULE).split('\n').filter((line) => line === BACKGROUND).length, 1);
  assert.equal(read('AGENTS.md').includes('Start a background process'), false);
});

test('04 no longer holds the moved rules', () => {
  const validation = read('.agents/instructions/04-validation-and-testing.md');
  for (const rule of MOVED) assert.equal(validation.includes(rule), false, rule);
});

test('AGENTS.md routes the module right after 15 and the Normal level loads it', () => {
  const agents = read('AGENTS.md');
  const entries = [...agents.matchAll(/^- `(\d+-[\w-]+\.md)`:(.*)$/gm)];
  assert.deepEqual(entries.slice(-2).map(([, name, condition]) => [name, condition]), [
    ['15-contracts-and-automation.md', ' before changing APIs, events, other shared contracts, or automation.'],
    ['16-command-execution.md', ` ${CONDITION}`],
  ]);
  const normal = agents.split('\n').find((line) => line.startsWith('| Normal |'));
  assert.ok(normal.includes('`02`, `03`, `04`, `14`, `16`, and matching area modules'), normal);
});
