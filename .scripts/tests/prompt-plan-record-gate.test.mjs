// What record NN after asks of a plan that has a check for the fragment, how it keeps the status column of the index,
// and the evidence helper that a plan copies beside lib: all in a plan folder of a throwaway repository.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { ROOT, patchPlan, startRepo } from './support.mjs';

const BUNDLED = join(ROOT, '.agents', 'skills', 'prompt-plan', 'scripts', 'node');
const INDEX = '| Fragment | Objective | Closes | Depends | Status |\n| --- | --- | --- | --- | --- |\n'
  + '| [01](01-step.md) | a \\| b | AC1 | none | pending |\n| [02](02-step.md) | c | AC2 | 01 | pending |\n';

// A plan with the check library, an index, the evidence helper when asked, and, per options, a check for fragment 01 that fails
// while .temp/fail exists.
function makePlan(t, { check = true, index = INDEX, evidence = false } = {}) {
  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01', '02']);
  mkdirSync(join(plan, 'check'), { recursive: true });
  cpSync(join(BUNDLED, 'check-lib.mjs'), join(plan, 'check', 'lib.mjs'));
  if (evidence) cpSync(join(BUNDLED, 'check-evidence.mjs'), join(plan, 'check', 'evidence.mjs'));
  if (index !== null) writeFileSync(join(plan, 'build', '00-index.md'), index);
  if (check) {
    writeFileSync(join(plan, 'check', '01-check.mjs'), "import { existsSync } from 'node:fs';\nimport { condition, runChecks } from './lib.mjs';\n"
      + `runChecks('01', [condition('C', 'passes', !existsSync(${JSON.stringify(join(repo.dir, '.temp', 'fail'))}))]);\n`);
  }
  const node = (script, ...args) => spawnSync(process.execPath, [join(plan, 'check', script), ...args], { cwd: repo.dir, encoding: 'utf8' });
  const record = (number, phase) => {
    if (phase === 'after') repo.write('kept.txt', `${number}\n`);
    return patch('record', number, phase);
  };
  const logs = () => (existsSync(join(plan, 'review')) ? readdirSync(join(plan, 'review')).filter((name) => name.endsWith('.log')) : []);
  return { repo, plan, node, record, logs, index: () => readFileSync(join(plan, 'build', '00-index.md'), 'utf8') };
}

test('prompt-plan record: after refuses, before writing, while no passing log of the fragment check is newer than its before record', (t) => {
  const { repo, plan, node, record, logs } = makePlan(t);
  assert.equal(node('01-check.mjs').status, 0);
  assert.equal(record('01', 'before').status, 0);
  const refusal = (why) => {
    const refused = record('01', 'after');
    assert.notEqual(refused.status, 0, why);
    assert.match(refused.stderr, /01-check\.mjs/, why);
    assert.deepEqual(readdirSync(join(plan, 'patch')).filter((name) => /^01\.(patch|state)$/.test(name)), [], `${why}: nothing is written`);
  };
  refusal('a log older than the before record is no evidence');
  const flag = join(repo.dir, '.temp', 'fail');
  repo.write('.temp/fail', '');
  assert.equal(node('01-check.mjs').status, 1);
  refusal('a failing log');
  rmSync(flag);
  assert.equal(node('01-check.mjs').status, 0);
  repo.write('.temp/fail', '');
  assert.equal(node('01-check.mjs').status, 1);
  refusal('a failing run after a passing one');
  rmSync(flag);
  assert.equal(node('01-check.mjs').status, 0);
  assert.equal(logs().length, 5);
  const done = record('01', 'after');
  assert.equal(done.status, 0, `${done.stdout}${done.stderr}`);
  assert.ok(existsSync(join(plan, 'patch', '01.state')));
});

test('prompt-plan record: a fragment without an NN-check script has no gate, whatever the check of another fragment', (t) => {
  const { record } = makePlan(t);
  assert.equal(record('02', 'before').status, 0);
  const after = record('02', 'after');
  assert.equal(after.status, 0, `${after.stdout}${after.stderr}`);
});

test('prompt-plan record: after sets the status cell of the fragment row to done and leaves the rest of the index as it is', (t) => {
  const { record, index } = makePlan(t, { check: false });
  record('01', 'before');
  const after = record('01', 'after');
  assert.equal(after.status, 0, after.stderr);
  assert.equal(index(), INDEX.replace('| none | pending |', '| none | done |'));
  record('02', 'before');
  assert.equal(record('02', 'after').status, 0);
  assert.equal(index(), INDEX.replaceAll('pending', 'done'));
});

test('prompt-plan record: after warns and changes nothing when the index, the row, or its status cell is missing or malformed', (t) => {
  const malformed = [
    ['a missing index', null],
    ['a missing row', INDEX.split('\n').filter((line) => !line.includes('01-step')).join('\n')],
    ['a status cell that is no status', INDEX.replace('| none | pending |', '| none | soon |')],
    ['two rows for the fragment', `${INDEX}| [01](01-step.md) | again | AC1 | none | pending |\n`],
  ];
  for (const [name, index] of malformed) {
    const { plan, record } = makePlan(t, { check: false, index });
    record('01', 'before');
    const after = record('01', 'after');
    assert.equal(after.status, 0, `${name}: ${after.stderr}`);
    assert.match(after.stderr, /00-index\.md/, name);
    assert.ok(existsSync(join(plan, 'patch', '01.state')), name);
    if (index !== null) assert.equal(readFileSync(join(plan, 'build', '00-index.md'), 'utf8'), index, name);
    else assert.equal(existsSync(join(plan, 'build', '00-index.md')), false, name);
  }
});

test('prompt-plan evidence: stdin goes through redact into review/NN-name-UTC.ext, named as latestEvidence reads it, and the path is printed', async (t) => {
  const { repo, plan, node } = makePlan(t, { evidence: true });
  const saved = spawnSync(process.execPath, [join(plan, 'check', 'evidence.mjs'), '01', 'shot', 'txt'], { cwd: repo.dir, encoding: 'utf8', input: 'password=hunter2\nplain text\n' });
  assert.equal(saved.status, 0, saved.stderr);
  const lib = await import(pathToFileURL(join(plan, 'check', 'lib.mjs')).href);
  const found = lib.latestEvidence('01', 'shot', 'txt');
  assert.ok(found, 'latestEvidence reads the file');
  assert.equal(readFileSync(found, 'utf8'), 'password=[REDACTED]\nplain text\n');
  assert.equal(join(repo.dir, saved.stdout.trim()), found);
  assert.deepEqual(readdirSync(join(plan, 'review')), [found.split(/[\\/]/).at(-1)]);
  for (const args of [['01', 'check', 'txt'], ['01', 'baseline-x', 'txt'], ['1', 'shot', 'txt'], ['01', '../x', 'txt'], ['01', 'shot'], ['01', 'shot', 'tx.t'], ['00', 'shot', 'txt'], ['01', '-flag', 'txt']]) {
    const refused = node('evidence.mjs', ...args);
    assert.equal(refused.status, 2, args.join(' '));
    assert.doesNotMatch(refused.stderr, /\n\s+at /, 'no stack trace');
  }
});
