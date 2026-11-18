import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { makePlan } from './prompt-plan-cache-plan.mjs';
import { ROOT, run } from './support.mjs';

function recorded(t, { change = true } = {}) {
  const context = makePlan(t);
  const { check, plan, repo } = context;
  const source = join(ROOT, '.agents', 'skills', 'prompt-plan', 'scripts', 'node');
  mkdirSync(join(plan, 'patch'));
  mkdirSync(join(plan, 'build'));
  for (const name of ['common', 'record']) cpSync(join(source, `${name}.mjs`), join(plan, 'patch', `${name}.mjs`));
  cpSync(join(source, 'check-evidence.mjs'), join(check, 'evidence.mjs'));
  writeFileSync(join(plan, 'build', '01-step.md'), '# 01\n<!-- test-path: behavior.test.mjs -->\n');
  const before = run(process.execPath, [join(plan, 'patch', 'record.mjs'), '01', 'before'], { cwd: repo.dir });
  assert.equal(before.status, 0, `${before.stdout}${before.stderr}`);
  if (change) repo.write('behavior.test.mjs', "console.log('BEGIN full stdout\\ntoken=synthetic-red-token');\nconsole.error('EXPECTED behavior assertion\\nEND full stderr');\nprocess.exitCode = 1;\n");
  const red = (expected = 'EXPECTED behavior assertion', testPath = 'behavior.test.mjs') => context.node('evidence.mjs', [
    '01', 'red', '--test-path', testPath, '--expect', expected, '--', process.execPath, 'behavior.test.mjs',
  ]);
  const names = () => existsSync(join(plan, 'review')) ? readdirSync(join(plan, 'review')) : [];
  const outcome = () => JSON.parse(readFileSync(join(plan, 'review', names().find((name) => name.endsWith('.json'))), 'utf8'));
  return { red, names, outcome, plan, repo, node: context.node };
}

test('prompt-plan red: tests-only work matches the before state and preserves full redacted process output', (t) => {
  const { names, outcome, plan, red } = recorded(t);
  const result = red();
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  const json = outcome();
  assert.equal(json.status, 'red');
  assert.equal(json.exit, 1);
  assert.equal(json.before, json.after);
  assert.deepEqual(json.testPaths, ['behavior.test.mjs']);
  const log = readFileSync(join(plan, 'review', names().find((name) => name.endsWith('.log'))), 'utf8');
  assert.match(log, /BEGIN full stdout\ntoken=\[REDACTED\]/);
  assert.match(log, /EXPECTED behavior assertion\nEND full stderr/);
  assert.doesNotMatch(log, /synthetic-red-token/);
});

test('prompt-plan record: cannot finish a fragment whose required check is missing', (t) => {
  const { plan, repo } = recorded(t, { change: false });
  writeFileSync(join(plan, 'build', '01-step.md'), '# 01\n<!-- check: required -->\n');
  rmSync(join(plan, 'check', '01-check.mjs'));
  const after = run(process.execPath, [join(plan, 'patch', 'record.mjs'), '01', 'after'], { cwd: repo.dir });
  assert.notEqual(after.status, 0);
  assert.match(after.stderr, /required check.*missing/);
  assert.equal(existsSync(join(plan, 'patch', '01.state')), false);
});

test('prompt-plan red: refuses a product change or test path outside the declared test files before running', (t) => {
  const { names, red, repo } = recorded(t);
  assert.equal(red('EXPECTED behavior assertion', 'kept.txt').status, 2);
  repo.write('kept.txt', 'feature already changed');
  const result = red();
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /before state/);
  assert.deepEqual(names(), []);
});

test('prompt-plan red: a different failure is preserved as unverified evidence', (t) => {
  const { outcome, red } = recorded(t);
  const result = red('UNRELATED error');
  assert.equal(result.status, 1);
  assert.equal(outcome().status, 'unverified');
});

test('prompt-plan red: a test declaration added after record before cannot exclude implementation changes', (t) => {
  const { names, plan, red, repo } = recorded(t, { change: false });
  writeFileSync(join(plan, 'build', '01-step.md'), '# 01\n<!-- test-path: kept.txt -->\n');
  repo.write('kept.txt', 'implementation already changed');
  const result = red('EXPECTED behavior assertion', 'kept.txt');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /test path declarations changed/);
  assert.deepEqual(names(), []);
});

test('prompt-plan record: an earlier passing check cannot mark an edited tree done with versioned evidence', (t) => {
  const { node, plan, repo } = recorded(t, { change: false });
  const after = () => run(process.execPath, [join(plan, 'patch', 'record.mjs'), '01', 'after'], { cwd: repo.dir });
  assert.equal(node('01-check.mjs').status, 0);
  repo.write('kept.txt', 'changed after the check');
  const stale = after();
  assert.equal(stale.status, 1, `${stale.stdout}${stale.stderr}`);
  assert.match(stale.stderr, /stale/);
  assert.equal(existsSync(join(plan, 'patch', '01.state')), false);
  assert.equal(node('01-check.mjs').status, 0);
  const fresh = after();
  assert.equal(fresh.status, 0, `${fresh.stdout}${fresh.stderr}`);
});
