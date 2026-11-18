import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import test from 'node:test';
import {
  applyMigration, checkDeliveredBasis, checkHistory, closurePlan, countSamples, evidenceGuidance, implementationGuidance, json,
} from './prompt-plan-closure-data-fixture.mjs';

const read = (path) => readFileSync(path, 'utf8');
const rule = (guidance, start) => guidance.split('\n').find((line) => line.startsWith(`- ${start}`)) ?? '';

test('closure counts are quoted from cited command output', (t) => {
  for (const guidance of [rule(evidenceGuidance(), 'Save evidence'), rule(implementationGuidance(), 'Corrections:')]) {
    assert.match(guidance, /quote\b[^.]*\bcounts?\b[^.]*\bsaved command output/i);
  }
  const { repo, plan, node, save } = closurePlan(t, { 'count-samples.mjs': countSamples });
  const result = node(join(repo.dir, 'count-samples.mjs'));
  assert.equal(result.status, 0, result.stderr);
  const evidence = save('sample-counts', result.stdout);
  assert.equal(read(evidence), 'Captures: 47\nTriggers: 8\n');

  const claim = (captures, triggers) => `${captures} captures and ${triggers} triggers ([command output](${basename(evidence)})).`;
  const auditClaim = (line) => {
    const [, captures, triggers, path] = /^(\d+) captures and (\d+) triggers \(\[command output\]\(([^)]+)\)\)\.$/.exec(line);
    const output = read(join(plan, 'review', path));
    const [, actualCaptures, actualTriggers] = /^Captures: (\d+)\nTriggers: (\d+)\n$/.exec(output);
    assert.deepEqual([captures, triggers], [actualCaptures, actualTriggers], 'claim differs from the cited command output');
  };
  auditClaim(claim(47, 8));
  assert.throws(() => auditClaim(claim(48, 8)), /claim differs/);
  assert.throws(() => auditClaim(claim(47, 9)), /claim differs/);
});

test('consumer migration rehearses in disposable state and awaits review and authorization before applying', (t) => {
  const execution = rule(evidenceGuidance(), 'Save evidence');
  assert.match(execution, /rehearse migrations in isolated disposable state.*review them independently/i);
  assert.match(execution, /only after that review passes and the user has authorized it/i);
  assert.match(execution, /verify the applied state and invariants afterward/i);
  const migration = rule(implementationGuidance(), 'Migrations:');
  assert.match(migration, /rehearse.*disposable, isolated state.*preconditions, invariants, and recovery/i);
  assert.match(migration, /authorized persistent environment only after independent verification passes/i);
  assert.match(migration, /recheck its applied state afterward/i);
  const { repo, node, save } = closurePlan(t, { 'apply-migration.mjs': applyMigration });
  const initial = { history: ['0121'], rows: [{ id: 1, name: 'saved row' }] };
  const applied = { history: ['0121', '0122'], rows: [{ id: 1, name: 'saved row', active: true }] };
  const stored = join(repo.dir, '.temp', 'persistent.json');
  const rehearsal = join(repo.dir, '.temp', 'disposable.json');
  repo.write('.temp/persistent.json', json(initial));
  repo.write('.temp/disposable.json', json(initial));
  const attempt = (target, review, authorization, status, outcome) => {
    const result = node(join(repo.dir, 'apply-migration.mjs'), [target, review, authorization]);
    assert.equal(result.status, status, result.stderr);
    const receipt = JSON.parse(read(save(`${target}-${review}-${authorization}`, result.stdout)));
    assert.deepEqual(receipt, { target, review, authorization, outcome, ...(status === 0 ? { state: applied } : {}) });
  };

  attempt('disposable', 'pending', 'pending', 0, 'applied');
  assert.deepEqual(JSON.parse(read(rehearsal)), applied);
  assert.equal(read(stored), json(initial));
  for (const [review, authorization] of [['pending', 'pending'], ['passed', 'pending'], ['failed', 'authorized']]) {
    attempt('persistent', review, authorization, 1, 'blocked');
    assert.equal(read(stored), json(initial));
  }
  attempt('persistent', 'passed', 'authorized', 0, 'applied');
  assert.deepEqual(JSON.parse(read(stored)), applied);
});

test('consumer migration history allows a later migration and rejects missing, duplicate, or reordered IDs', (t) => {
  const migration = rule(implementationGuidance(), 'Migrations:');
  assert.match(migration, /presence, uniqueness, and order relative to declared dependencies/i);
  assert.match(migration, /require last position only when the criterion explicitly needs it/i);
  const { repo, node, save } = closurePlan(t, { 'check-history.mjs': checkHistory });
  const check = (name, history, status, reason) => {
    const input = '.temp/migration-history.json';
    repo.write(input, json(history));
    const result = node(join(repo.dir, 'check-history.mjs'), [input]);
    assert.equal(result.status, status, result.stderr);
    assert.equal(read(save(name, result.stdout + result.stderr)).trim(), reason);
  };
  check('later', ['0121', '0122', '0123'], 0, '0122 follows 0121 in 0121, 0122, 0123');
  check('missing', ['0121', '0123'], 1, '0122 must appear exactly once');
  check('duplicate', ['0121', '0122', '0122', '0123'], 1, '0122 must appear exactly once');
  check('reordered', ['0122', '0121', '0123'], 1, '0121 must precede 0122');
});

test('a dependent consumer catches delivered discrepancies and dry-runs the corrected basis before recording', (t) => {
  const order = rule(evidenceGuidance(), "Before opening a dependent plan's first record");
  assert.match(order, /compare the delivered predecessor.*revision, routes, contracts, stored state and checks/i);
  assert.match(order, /record each discrepancy.*revise only pending fragments in scope.*dry-run affected checks against the delivered base/i);
  const original = { route: '/legacy', contract: 'v1', storedState: '0121', check: 'legacy smoke' };
  const delivered = { route: '/current', contract: 'v2', storedState: '0122', check: 'current smoke' };
  const { repo, plan, check, patch, node } = closurePlan(t, { 'consumer.json': json(original) });
  const git = (...args) => {
    const result = repo.git(...args);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const originalRevision = git('rev-parse', 'HEAD');
  const assumptions = join(plan, 'build', '01-assumptions.json');
  const checkScript = join(check, '01-check.mjs');
  writeFileSync(assumptions, json({ revision: originalRevision, ...original }));
  writeFileSync(checkScript, checkDeliveredBasis);
  repo.write('consumer.json', json(delivered));
  git('add', 'consumer.json');
  git('commit', '-q', '-m', 'deliver predecessor');
  const deliveredRevision = git('rev-parse', 'HEAD');
  const record = (name) => join(plan, 'patch', `01.${name}`);
  const dryRun = (status) => {
    const result = node(checkScript, ['--dry-run']);
    assert.equal(result.status, status, result.stderr);
    const output = /Evidence: ([^\r\n]+)/.exec(result.stdout);
    assert.ok(output, result.stderr || result.stdout);
    const [, evidence] = output;
    assert.match(basename(evidence), /^01-dry-run-/);
    return read(join(repo.dir, evidence));
  };

  const mismatch = dryRun(1);
  assert.match(mismatch, /^## FAIL C13:/m);
  assert.ok(mismatch.includes(`revision: ${originalRevision} -> ${deliveredRevision}`));
  for (const [field, value] of Object.entries(original)) assert.ok(mismatch.includes(`${field}: ${value} -> ${delivered[field]}`));
  for (const name of ['before', 'untracked']) assert.equal(existsSync(record(name)), false);

  writeFileSync(assumptions, json({ revision: deliveredRevision, ...delivered }));
  assert.match(dryRun(0), /^## PASS C13:/m);
  const recorded = patch('record', '01', 'before');
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.equal(read(record('before')).split('\n')[0], git('rev-parse', 'HEAD^{tree}'));
  assert.equal(existsSync(record('untracked')), true);
  assert.equal(git('status', '--short'), '');
});
