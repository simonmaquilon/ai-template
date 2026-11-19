import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT } from './support.mjs';
import { ALL, BUNDLE, setup, show } from './prompt-plan-migrate-fixture.mjs';

test('migrate an active plan and preserve recorded patches and historic times', (t) => {
  const fixture = setup(t);
  if (!fixture) return;
  const { repo, plan, cli, migrate } = fixture;
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
  const fixture = setup(t);
  if (!fixture) return;
  const { repo, plan, local, migrate } = fixture;
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
  const fixture = setup(t, { commit: 'a370d08', helpers: ALL });
  if (!fixture) return;
  const { repo, plan, migrate } = fixture;
  repo.write('.temp/plans/example/check/state.mjs', `${readFileSync(join(plan, 'check', 'state.mjs'), 'utf8')}// customized\n`);
  const custom = migrate();
  assert.notEqual(custom.status, 0);
  assert.match(custom.stderr, /customized.*check\/state\.mjs/i);
  writeFileSync(join(plan, 'check', 'state.mjs'), show('a370d08', 'check-state.mjs'));
  const result = migrate();
  assert.equal(result.status, 0, result.stderr);
  for (const [path, bundled] of Object.entries(ALL)) assert.deepEqual(readFileSync(join(plan, path)), readFileSync(join(ROOT, BUNDLE, bundled)), path);
  assert.equal(migrate().status, 0);
});

test('migrate a plan without a patch directory and reopen a legacy check citation', (t) => {
  const fixture = setup(t);
  if (!fixture) return;
  const { repo, plan, local, migrate } = fixture;
  rmSync(join(plan, 'patch'), { recursive: true });
  repo.write(`${local}/review/report.md`, '✅ Check `01-check-2026-11-16T00-00-00-000Z.log`\n');
  const result = migrate();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(plan, 'patch')), false);
  assert.match(readFileSync(join(plan, 'review', 'report.md'), 'utf8'), /^⏳ .*rerun on the current tree/);
});
