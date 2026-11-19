// A plan of an earlier template version for the migration tests: its helpers are the bundled ones of a published commit,
// rebuilt with git show, so a clone without that history skips the test that needs it instead of failing.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, run, startRepo } from './support.mjs';

export const BUNDLE = '.agents/skills/prompt-plan/scripts/node';
export const MIGRATE = join(ROOT, BUNDLE, 'migrate.mjs');
export const LEGACY = {
  'patch/common.mjs': 'common.mjs', 'patch/apply.mjs': 'apply.mjs',
  'patch/revert.mjs': 'revert.mjs', 'patch/record.mjs': 'record.mjs',
  'check/lib.mjs': 'check-lib.mjs', 'check/all.mjs': 'check-all.mjs',
  'check/evidence.mjs': 'check-evidence.mjs', 'check/time.mjs': 'check-time.mjs',
};
export const ALL = { ...LEGACY, 'check/report.mjs': 'check-report.mjs', 'check/state.mjs': 'check-state.mjs', 'check/validation.mjs': 'check-validation.mjs' };

const available = (commit) => run('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: ROOT }).status === 0;
export const show = (commit, bundled) => {
  const read = run('git', ['show', `${commit}:${BUNDLE}/${bundled}`], { cwd: ROOT });
  assert.equal(read.status, 0, read.stderr);
  return read.stdout;
};

// The plan .temp/plans/<name> with the helpers of commit, or null after skipping the test when that commit is missing.
export function setup(t, { commit = '20033c7', helpers = LEGACY, name = 'example' } = {}) {
  if (!available(commit)) {
    t.skip(`commit ${commit} is not in this clone's history (a shallow clone), and its helpers are the plan this test migrates`);
    return null;
  }
  const repo = startRepo(t);
  const local = `.temp/plans/${name}`;
  const plan = join(repo.dir, local);
  for (const dir of ['patch', 'check', 'build', 'review']) mkdirSync(join(plan, dir), { recursive: true });
  for (const [path, bundled] of Object.entries(helpers)) writeFileSync(join(plan, path), show(commit, bundled));
  repo.write(`${local}/build/01-step.md`, '# Step 1\n');
  repo.write(`${local}/build/02-step.md`, '# Step 2\n');
  repo.write(`${local}/build/00-index.md`, '| [Step 1](01-step.md) | pending |\n| [Step 2](02-step.md) | pending |\n');
  repo.write(`${local}/review/times.log`, '2026-11-16T00:00:00Z\t01\tStep 1\n');
  repo.write(`${local}/review/report.md`, '✅ First check\n');
  const cli = (script, ...args) => run(process.execPath, [join(plan, 'patch', `${script}.mjs`), ...args], { cwd: repo.dir });
  return { repo, plan, local, cli, migrate: (target = local) => run(process.execPath, [MIGRATE, target], { cwd: repo.dir }) };
}
