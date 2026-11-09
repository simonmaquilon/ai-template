#!/usr/bin/env node
// Runs the template's own checks, locally or in continuous integration, on any
// supported operating system: the hook tests under .scripts/tests with the
// runner built into Node, the prompt-plan skill tests among them as a separate step that a local run skips while
// the skill, those tests, and the helpers they share have no uncommitted change, the adopted security-audit skill
// integrity, the documentation link, Markdown structure and instruction-file checks, which fail on any report (the
// Markdown one runs check-markdown.mjs --all, which lints each whole .md file that Git lists and no attribute skips:
// vendored or generated unless `markdown-structure` is set, or `-markdown-structure`), the stack document check, which
// fails when a generated block of .docs/stack.md is out of date, the template manifest check, which fails when
// .agents/template-manifest.json is out of date, and the
// source-file limit, which receives the arguments given here, such as --base <revision>. Exits with status 1 when any
// step fails, and with status 3 when the only problem is a step the environment
// blocked, such as a sandbox that denies writes under .git or .temp, which never
// ran and so neither passed nor failed (04-validation-and-testing.md).

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The checks belong to the repository holding this script, whatever directory it starts in.
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const names = readdirSync(join('.scripts', 'tests')).filter((name) => name.endsWith('.test.mjs'));
const inTests = (list) => list.map((name) => join('.scripts', 'tests', name));
const planNames = names.filter((name) => name.startsWith('prompt-plan-'));
const tests = inTests(names.filter((name) => !planNames.includes(name)));
// The prompt-plan skill tests take most of the run, so a local run skips them unless the skill, those tests, or the
// helpers they share have uncommitted changes; continuous integration, which sets CI=true, always runs them.
// git reads the whole tests folder so that a deleted test counts, and the lines are filtered here.
const planStatus = spawnSync('git', ['--no-optional-locks', '--literal-pathspecs', 'status', '--porcelain',
  '--untracked-files=all', '--', '.agents/skills/prompt-plan', '.scripts/tests'], { encoding: 'utf8' });
const planChanged = /\.agents\/skills\/prompt-plan\/|\.scripts\/tests\/(?:support\.mjs|prompt-plan-[^/\s]*\.test\.mjs)/;
const planSkip = process.env.CI !== 'true' && planStatus.status === 0 && !planChanged.test(planStatus.stdout)
  ? 'no uncommitted change in .agents/skills/prompt-plan, .scripts/tests/support.mjs or .scripts/tests/prompt-plan-*.test.mjs; '
    + 'CI=true runs them'
  : null;

// The hook tests build throwaway git repositories under .temp; where they cannot write there, as in a read-only
// sandbox, or git cannot create one, as under a sandbox that denies writes under .git, every one of them would fail.
function gitBlocked() {
  let probe;
  try {
    mkdirSync('.temp', { recursive: true });
    probe = mkdtempSync(resolve('.temp', 'git-probe-'));
  } catch (error) {
    return `cannot write under .temp (${error.code ?? error.message})`;
  }
  const init = spawnSync('git', ['init', '-q', probe], { encoding: 'utf8' });
  rmSync(probe, { recursive: true, force: true, maxRetries: 5 });
  return init.status === 0 ? null
    : `git cannot create a repository here (${(init.stderr || String(init.error ?? '')).trim().split('\n')[0]}); ` +
      'under the Claude Code sandbox, run the command alone from the repository root (.readme/91-agent-sandbox.md)';
}
const gitBlock = gitBlocked();

const steps = [
  ['hook tests', ['--test', ...tests], (run) => run.status === 0, null, gitBlock],
  ['prompt-plan skill tests', ['--test', ...inTests(planNames)], (run) => run.status === 0, planSkip, gitBlock],
  ['security-audit skill integrity', [join('.scripts', 'check-security-skill.mjs')], (run) => run.status === 0],
  ['documentation links', [join('.scripts', 'check-doc-links.mjs')], (run) => run.status === 0 && run.stdout.trim() === ''],
  ['markdown structure', [join('.scripts', 'check-markdown.mjs'), '--all'], (run) => run.status === 0 && run.stdout.trim() === ''],
  ['instruction files', [join('.scripts', 'check-instructions.mjs')], (run) => run.status === 0 && run.stdout.trim() === ''],
  ['stack document', [join('.scripts', 'update-stack-doc.mjs'), '--check'], (run) => run.status === 0],
  ['template manifest', [join('.scripts', 'template-manifest.mjs'), '--check'], (run) => run.status === 0],
  ['source-file limit', [join('.scripts', 'check-file-length.mjs'), ...process.argv.slice(2)], (run) => run.status === 0],
];

let failed = false;
let blocked = false;
for (const [name, args, passes, skip, block] of steps) {
  if (skip) {
    console.log(`SKIP ${name}: ${skip}`);
    continue;
  }
  if (block) {
    console.log(`BLOCKED ${name}: ${block}`);
    blocked = true;
    continue;
  }
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(run.stdout ?? '');
  process.stderr.write(run.stderr ?? '');
  const ok = passes(run);
  failed ||= !ok;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}
process.exit(failed ? 1 : blocked ? 3 : 0);
