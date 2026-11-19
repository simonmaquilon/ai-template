// record NN after asks for the red receipt of a fragment that declares test paths, and the evidence helper never writes
// a tests-before log by hand.
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { recorded } from './prompt-plan-red-fixture.mjs';

const INCLUDE = ['--include', 'behavior.test.mjs'];

// The fragment with its test written, its check passing and, per options, a red run, so only record after is left.
function ready(t, { red = true, build, legacy = false } = {}) {
  const context = recorded(t);
  if (build) writeFileSync(join(context.plan, 'build', '01-step.md'), build);
  if (legacy) {
    // A before record of a plan older than the project snapshot holds its two first lines only.
    const beforeFile = join(context.plan, 'patch', '01.before');
    const [tree, root] = readFileSync(beforeFile, 'utf8').split('\n');
    writeFileSync(beforeFile, `${tree}\n${root}\n`);
  }
  if (red) assert.equal(context.red().status, 0);
  assert.equal(context.node('01-check.mjs').status, 0);
  const receipt = () => readdirSync(join(context.plan, 'review')).find((name) => /^01-tests-before-.*\.json$/.test(name));
  return { ...context, receipt };
}

const refused = (context, pattern, why) => {
  const result = context.after(...INCLUDE);
  assert.equal(result.status, 1, `${why}: ${result.stdout}${result.stderr}`);
  assert.match(result.stderr, pattern, why);
  for (const name of ['01.patch', '01.state']) assert.equal(existsSync(join(context.plan, 'patch', name)), false, `${why}: nothing is written`);
};

test('prompt-plan record: after refuses a fragment with declared test paths and no red receipt, naming the command that is missing', (t) => {
  const context = ready(t, { red: false });
  refused(context, /check[\\/]evidence\.mjs 01 red --test-path behavior\.test\.mjs --expect/, 'no receipt');
});

test('prompt-plan record: after refuses an unverified receipt, one of another before record, one with an altered log, and other test paths', (t) => {
  const unverified = ready(t, { red: false });
  assert.equal(unverified.red('UNRELATED error').status, 1);
  assert.equal(JSON.parse(readFileSync(join(unverified.plan, 'review', unverified.receipt()), 'utf8')).status, 'unverified');
  assert.equal(unverified.node('01-check.mjs').status, 0);
  refused(unverified, /evidence\.mjs 01 red/, 'an unverified receipt');

  const other = ready(t);
  const beforeFile = join(other.plan, 'patch', '01.before');
  const [tree, root, project] = readFileSync(beforeFile, 'utf8').split('\n');
  writeFileSync(beforeFile, `${tree}\n${root}\n${JSON.stringify({ ...JSON.parse(project), basis: 'f'.repeat(64) })}\n`);
  refused(other, /evidence\.mjs 01 red/, 'a receipt of another before record');

  const altered = ready(t);
  appendFileSync(join(altered.plan, 'review', altered.receipt().replace(/\.json$/, '.log')), 'edited by hand\n');
  refused(altered, /evidence\.mjs 01 red/, 'a log that no longer matches its hash');

  const declared = ready(t);
  writeFileSync(join(declared.plan, 'build', '01-step.md'), '# 01\n<!-- test-path: behavior.test.mjs -->\n<!-- test-path: other.test.mjs -->\n');
  refused(declared, /evidence\.mjs 01 red/, 'other declared test paths');
});

test('prompt-plan record: after accepts a valid red receipt', (t) => {
  const context = ready(t);
  const result = context.after(...INCLUDE);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.ok(existsSync(join(context.plan, 'patch', '01.state')));
});

test('prompt-plan record: a fragment without declared test paths, or a legacy before record without the project snapshot, keeps its behavior', (t) => {
  const plain = ready(t, { red: false, build: '# 01\n' });
  assert.equal(plain.after(...INCLUDE).status, 0);

  const result = ready(t, { red: false, legacy: true }).after(...INCLUDE);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test('prompt-plan evidence: the names of the red log and of the final output are no manual evidence', async (t) => {
  const { plan, repo } = ready(t, { red: false });
  const lib = await import(pathToFileURL(join(plan, 'check', 'lib.mjs')).href);
  for (const name of ['tests-before', 'tests-before-x', 'final-output']) {
    assert.throws(() => lib.evidenceFile('01', name, 'log'), /reserved/, name);
    assert.throws(() => lib.latestEvidence('01', name, 'log'), /reserved/, name);
  }
  for (const name of ['tests-before', 'final-output', 'tests-before-x']) {
    const saved = spawnSync(process.execPath, [join(plan, 'check', 'evidence.mjs'), '01', name, 'log'], { cwd: repo.dir, encoding: 'utf8', input: 'forged\n' });
    assert.equal(saved.status, 2, name);
    assert.match(saved.stderr, /tests-before|final-output/, name);
  }
  assert.deepEqual(readdirSync(join(plan, 'review')).filter((name) => /^01-(?:tests-before|final-output)/.test(name)), [], 'nothing was written');
});
