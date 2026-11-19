// The migration's own files and arguments: its temporaries never sit among the files the evidence fingerprints, an
// interrupted run leaves nothing behind that a later one keeps, and a plan folder takes the names a plan is given.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { ALL, setup } from './prompt-plan-migrate-fixture.mjs';

const OLD = { commit: 'a370d08', helpers: ALL };
const UUID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const residual = (dir) => readdirSync(dir, { recursive: true }).filter((name) => String(name).endsWith('.tmp'));
const fingerprint = async (plan) => (await import(pathToFileURL(join(plan, 'check', 'state.mjs')).href)).checkFingerprint(plan);

test('prompt-plan migrate: a temporary an interrupted run left is removed, and the plan fingerprints as after a clean run', async (t) => {
  const clean = setup(t, OLD);
  const dirty = setup(t, OLD);
  if (!clean || !dirty) return;
  mkdirSync(join(dirty.plan, '.cache', 'migrate'), { recursive: true });
  const seeded = [['.cache', 'migrate', `${UUID}.tmp`], ['check', `lib.mjs.${UUID}.tmp`], ['patch', `record.mjs.${UUID}.tmp`],
    ['review', `report.md.${UUID}.tmp`]];
  for (const parts of seeded) writeFileSync(join(dirty.plan, ...parts), 'partial');
  assert.equal(clean.migrate().status, 0);
  const result = dirty.migrate();
  assert.equal(result.status, 0, result.stderr);
  for (const dir of ['check', 'build', 'patch', 'review', '.cache']) assert.deepEqual(residual(join(dirty.plan, dir)), [], dir);
  assert.deepEqual(residual(join(clean.plan, 'check')), []);
  assert.equal(await fingerprint(dirty.plan), await fingerprint(clean.plan));
  assert.equal(existsSync(join(dirty.plan, 'check', 'state.mjs')), true);
  assert.equal(dirty.migrate().status, 0);
});

test('prompt-plan migrate: a plan folder is one segment of letters, digits, "-" and "_" that starts with a letter or digit', (t) => {
  const fixture = setup(t, { ...OLD, name: '2026-11-19-Fix_Login' });
  if (!fixture) return;
  const { plan, local, migrate } = fixture;
  const result = migrate(local);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(plan, 'check', 'state.mjs')), true);
  for (const name of ['Aa_9', 'x', '9-Z_z']) assert.doesNotMatch(migrate(`.temp/plans/${name}`).stderr, /^Usage/, name);
  for (const bad of ['.temp/plans/', '.temp/plans', '.temp/plans/.', '.temp/plans/..', '.temp/plans/a/b', '.temp/plans//x', '.temp/plans/.hidden',
    '.temp/plans/-x', '.temp/plans/_x', '.temp/plans/a b', '.temp/plans/a.b', '.temp/other/x', 'plans/x', 'x', '../.temp/plans/x', '/abs/.temp/plans/x', '']) {
    const refused = migrate(bad);
    assert.notEqual(refused.status, 0, bad);
    assert.match(refused.stderr, /^Usage/, bad);
  }
});
