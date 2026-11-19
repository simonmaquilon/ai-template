import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, run, startRepo } from './support.mjs';

const BUNDLE = '.agents/skills/prompt-plan/scripts/node';
const MIGRATE = join(ROOT, BUNDLE, 'migrate.mjs');
const LEGACY = {
  'patch/common.mjs': 'common.mjs', 'patch/apply.mjs': 'apply.mjs',
  'patch/revert.mjs': 'revert.mjs', 'patch/record.mjs': 'record.mjs',
  'check/lib.mjs': 'check-lib.mjs', 'check/all.mjs': 'check-all.mjs',
  'check/evidence.mjs': 'check-evidence.mjs', 'check/time.mjs': 'check-time.mjs',
};

function setup(t) {
  const repo = startRepo(t);
  const local = '.temp/plans/example';
  const plan = join(repo.dir, local);
  for (const name of ['patch', 'check', 'build', 'review']) mkdirSync(join(plan, name), { recursive: true });
  for (const [path, bundled] of Object.entries(LEGACY)) {
    const read = run('git', ['show', `20033c7:${BUNDLE}/${bundled}`], { cwd: ROOT });
    assert.equal(read.status, 0, read.stderr);
    writeFileSync(join(plan, path), read.stdout);
  }
  repo.write(`${local}/build/01-step.md`, '# Step 1\n');
  repo.write(`${local}/build/02-step.md`, '# Step 2\n');
  repo.write(`${local}/build/00-index.md`, '| [Step 1](01-step.md) | pending |\n| [Step 2](02-step.md) | pending |\n');
  repo.write(`${local}/review/times.log`, '2026-11-16T00:00:00Z\t01\tStep 1\n');
  repo.write(`${local}/review/report.md`, '✅ First check\n');
  const cli = (script, ...args) => run(process.execPath, [join(plan, 'patch', `${script}.mjs`), ...args], { cwd: repo.dir });
  return { repo, plan, local, cli, migrate: () => run(process.execPath, [MIGRATE, local], { cwd: repo.dir }) };
}

test('migrate an active plan and preserve recorded patches and historic times', (t) => {
  const { repo, plan, cli, migrate } = setup(t);
  assert.equal(cli('record', '01', 'before').status, 0);
  repo.write('kept.txt', 'after\n');
  assert.equal(cli('record', '01', 'after').status, 0);
  const historical = ['patch/01.patch', 'patch/01.state', 'review/times.log'].map((file) => [file, readFileSync(join(plan, file))]);
  const result = migrate();
  assert.equal(result.status, 0, result.stderr);
  for (const [file, bytes] of historical) assert.deepEqual(readFileSync(join(plan, file)), bytes);
  assert.equal(existsSync(join(plan, 'check', 'report.mjs')), true);
  assert.equal(cli('revert', '01').status, 0);
  assert.equal(readFileSync(join(repo.dir, 'kept.txt'), 'utf8'), 'before\n');
  assert.equal(cli('apply', '01').status, 0);
  assert.equal(readFileSync(join(repo.dir, 'kept.txt'), 'utf8'), 'after\n');
  assert.equal(migrate().status, 0);
});

test('refuse a custom helper or a completed plan before replacing any helper', (t) => {
  const { repo, plan, local, migrate } = setup(t);
  const original = readFileSync(join(plan, 'check', 'all.mjs'));
  repo.write(`${local}/patch/record.mjs`, '// customized\n');
  const custom = migrate();
  assert.notEqual(custom.status, 0);
  assert.match(custom.stderr, /customized.*patch\/record\.mjs/i);
  assert.deepEqual(readFileSync(join(plan, 'check', 'all.mjs')), original);
  repo.write(`${local}/build/00-index.md`, '| [Step 1](01-step.md) | done |\n| [Step 2](02-step.md) | done |\n');
  const closed = migrate();
  assert.notEqual(closed.status, 0);
  assert.match(closed.stderr, /completed plan/i);
  assert.deepEqual(readFileSync(join(plan, 'check', 'all.mjs')), original);
});

test('migrate a plan created or migrated with the 7.0.0 helpers, and refuse one of them customized', (t) => {
  const { repo, plan, migrate } = setup(t);
  const helpers = { ...LEGACY, 'check/report.mjs': 'check-report.mjs', 'check/state.mjs': 'check-state.mjs', 'check/validation.mjs': 'check-validation.mjs' };
  for (const [path, bundled] of Object.entries(helpers)) {
    const read = run('git', ['show', `a370d08:${BUNDLE}/${bundled}`], { cwd: ROOT });
    assert.equal(read.status, 0, read.stderr);
    writeFileSync(join(plan, path), read.stdout);
  }
  repo.write('.temp/plans/example/check/state.mjs', `${readFileSync(join(plan, 'check', 'state.mjs'), 'utf8')}// customized\n`);
  const custom = migrate();
  assert.notEqual(custom.status, 0);
  assert.match(custom.stderr, /customized.*check\/state\.mjs/i);
  const read = run('git', ['show', `a370d08:${BUNDLE}/check-state.mjs`], { cwd: ROOT });
  writeFileSync(join(plan, 'check', 'state.mjs'), read.stdout);
  const result = migrate();
  assert.equal(result.status, 0, result.stderr);
  for (const [path, bundled] of Object.entries(helpers)) assert.deepEqual(readFileSync(join(plan, path)), readFileSync(join(ROOT, BUNDLE, bundled)), path);
  assert.equal(migrate().status, 0);
});

test('migrate a plan without a patch directory and reopen a legacy check citation', (t) => {
  const { repo, plan, local, migrate } = setup(t);
  rmSync(join(plan, 'patch'), { recursive: true });
  repo.write(`${local}/review/report.md`, '✅ Check `01-check-2026-11-16T00-00-00-000Z.log`\n');
  const result = migrate();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(plan, 'patch')), false);
  assert.match(readFileSync(join(plan, 'review', 'report.md'), 'utf8'), /^⏳ .*rerun on the current tree/);
});
