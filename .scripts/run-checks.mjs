#!/usr/bin/env node
// Runs the template's own checks, locally or in continuous integration, on any
// supported operating system: the hook tests under .scripts/tests with the
// runner built into Node, the documentation link check and the instruction-file
// check, which fail on any report, and the source-file limit, which receives the
// arguments given here, such as --base <revision>. Exits with status 1 when any
// step fails.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { enterRepositoryRoot } from './hook-support.mjs';

enterRepositoryRoot();
const tests = readdirSync(join('.scripts', 'tests'))
  .filter((name) => name.endsWith('.test.mjs'))
  .map((name) => join('.scripts', 'tests', name));

const steps = [
  ['hook tests', ['--test', ...tests], (run) => run.status === 0],
  ['documentation links', [join('.scripts', 'check-doc-links.mjs')], (run) => run.status === 0 && run.stdout.trim() === ''],
  ['instruction files', [join('.scripts', 'check-instructions.mjs')], (run) => run.status === 0 && run.stdout.trim() === ''],
  ['source-file limit', [join('.scripts', 'check-file-length.mjs'), ...process.argv.slice(2)], (run) => run.status === 0],
];

let failed = false;
for (const [name, args, passes] of steps) {
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(run.stdout ?? '');
  process.stderr.write(run.stderr ?? '');
  const ok = passes(run);
  failed ||= !ok;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}
process.exit(failed ? 1 : 0);
