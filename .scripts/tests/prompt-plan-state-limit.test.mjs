// A file over 1 MiB in check/ or build/ stops the evidence with a reason that names it and the limit, where all --final
// and record after used to report only stale evidence.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { makePlan } from './prompt-plan-cache-plan.mjs';
import { recorded } from './prompt-plan-red-fixture.mjs';

const BIG = Buffer.alloc(1024 ** 2 + 1, 'x');
const NAMES_LIMIT = /1 MiB/;

test('prompt-plan state: inputProblem names the oversized file of check/ or build/ and the limit, and nothing for a tree within it', async (t) => {
  const { plan, repo } = recorded(t, { change: false });
  const state = await import(pathToFileURL(join(plan, 'check', 'state.mjs')).href);
  assert.equal(state.inputProblem(plan), null);
  assert.ok(state.captureIdentity(repo.dir, plan));
  writeFileSync(join(plan, 'build', 'rules.md'), BIG);
  assert.match(state.inputProblem(plan), /build\/rules\.md.*1 MiB.*1048576/);
  assert.equal(state.captureIdentity(repo.dir, plan), null, 'the identity itself stays null');
});

test('prompt-plan all: the final run says which input file is over the limit instead of a stale run only', (t) => {
  const { all, plan } = makePlan(t);
  for (const folder of ['check', 'build']) {
    mkdirSync(join(plan, folder), { recursive: true });
    const big = join(plan, folder, 'big.dat');
    writeFileSync(big, BIG);
    const result = all(['--final']);
    assert.equal(result.status, 1, `${folder}: ${result.stdout}${result.stderr}`);
    assert.match(`${result.stdout}${result.stderr}`, new RegExp(`${folder}/big\\.dat`), folder);
    assert.match(`${result.stdout}${result.stderr}`, NAMES_LIMIT, folder);
    rmSync(big);
  }
});

test('prompt-plan record: after names the oversized input file instead of reporting stale evidence', (t) => {
  const { after, node, plan } = recorded(t, { change: false });
  writeFileSync(join(plan, 'build', '01-step.md'), '# 01\n');
  writeFileSync(join(plan, 'check', 'big.dat'), BIG);
  assert.equal(node('01-check.mjs').status, 0);
  const result = after();
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /check\/big\.dat/);
  assert.match(result.stderr, NAMES_LIMIT);
  assert.equal(existsSync(join(plan, 'patch', '01.state')), false);
});
