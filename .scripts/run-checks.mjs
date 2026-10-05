#!/usr/bin/env node
// Runs the template's own checks, locally or in continuous integration, on any
// supported operating system: the hook tests under .scripts/tests with the
// runner built into Node, the adopted security-audit skill integrity and validator tests,
// the latter skipped where the validators cannot run, the documentation link check and the instruction-file
// check, which fail on any report, and the source-file limit, which receives the
// arguments given here, such as --base <revision>. Exits with status 1 when any
// step fails, and with status 3 when the only problem is a step the environment
// blocked, such as a sandbox that denies writes under .git, which never ran and
// so neither passed nor failed (17-validation-policy.md).

import { spawnSync } from 'node:child_process';
import { constants, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { enterRepositoryRoot } from './hook-support.mjs';

enterRepositoryRoot();
const tests = readdirSync(join('.scripts', 'tests'))
  .filter((name) => name.endsWith('.test.mjs'))
  .map((name) => join('.scripts', 'tests', name));

const vendor = join('.agents', 'skills', 'security-audit');
const vendorTemp = mkdtempSync(resolve('.temp', 'security-vendor-'));
// The vendored validators reject every input where these flags are missing, as on Windows.
const safeOpen = [constants.O_NOFOLLOW, constants.O_NONBLOCK].every((flag) => Number.isInteger(flag) && flag !== 0);
// The hook tests build throwaway git repositories; where git cannot create one,
// as under a sandbox that denies writes under .git, every one of them would fail.
const probe = mkdtempSync(resolve('.temp', 'git-probe-'));
const init = spawnSync('git', ['init', '-q', probe], { encoding: 'utf8' });
rmSync(probe, { recursive: true, force: true, maxRetries: 5 });
const gitBlocked = init.status === 0 ? null
  : `git cannot create a repository here (${(init.stderr || String(init.error ?? '')).trim().split('\n')[0]}); ` +
    'under the Claude Code sandbox, run the command alone from the repository root (.readme/91-agent-sandbox.md)';
const steps = [
  ['hook tests', ['--test', ...tests], (run) => run.status === 0, undefined, null, gitBlocked],
  ['security-audit skill integrity', [join('.scripts', 'check-security-skill.mjs')], (run) => run.status === 0],
  ['security-audit skill tests', ['--test', join(vendor, 'validate-findings.test.cjs'), join(vendor, 'validate-coverage-ledger.test.cjs')],
    (run) => run.status === 0, { ...process.env, TMPDIR: vendorTemp, TEMP: vendorTemp, TMP: vendorTemp },
    safeOpen ? null : 'its validators need O_NOFOLLOW and O_NONBLOCK, which this platform lacks'],
  ['documentation links', [join('.scripts', 'check-doc-links.mjs')], (run) => run.status === 0 && run.stdout.trim() === ''],
  ['instruction files', [join('.scripts', 'check-instructions.mjs')], (run) => run.status === 0 && run.stdout.trim() === ''],
  ['source-file limit', [join('.scripts', 'check-file-length.mjs'), ...process.argv.slice(2)], (run) => run.status === 0],
];

let failed = false;
let blocked = false;
for (const [name, args, passes, env, skip, block] of steps) {
  if (skip) {
    console.log(`SKIP ${name}: ${skip}`);
    continue;
  }
  if (block) {
    console.log(`BLOCKED ${name}: ${block}`);
    blocked = true;
    continue;
  }
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env });
  process.stdout.write(run.stdout ?? '');
  process.stderr.write(run.stderr ?? '');
  const ok = passes(run);
  failed ||= !ok;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}
rmSync(vendorTemp, { recursive: true, force: true, maxRetries: 5 });
process.exit(failed ? 1 : blocked ? 3 : 0);
