// The check scripts that the prompt-plan skill copies into every plan, lib and all, exercised from a plan folder
// inside a throwaway repository, as the plan's own scripts use them.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { ROOT, WINDOWS, makeRepo } from './support.mjs';

const LIB = join(ROOT, '.agents', 'skills', 'prompt-plan', 'scripts', 'node', 'check-lib.mjs');

// A plan folder with the bundled library copied as check/lib.mjs, imported as a plan's scripts import it.
async function planLib(t) {
  const repo = makeRepo(t);
  const check = join(repo.dir, '.temp', 'plans', 'p', 'check');
  mkdirSync(check, { recursive: true });
  cpSync(LIB, join(check, 'lib.mjs'));
  return { repo, lib: await import(pathToFileURL(join(check, 'lib.mjs')).href) };
}

const freePort = () => new Promise((resolve) => {
  const probe = createServer().listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

// Whether something still serves url: a refused connection is a stopped server, a probe that times out is not.
async function answers(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    await response.body?.cancel();
    return true;
  } catch (error) {
    return error.name === 'TimeoutError';
  }
}

test('prompt-plan check library: withServer runs the check once, returns its result or lets its error through, and stops the server', async (t) => {
  const { repo, lib } = await planLib(t);
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  repo.write('server.mjs', "import { createServer } from 'node:http';\n"
    + "createServer((request, response) => response.end('ok')).listen(Number(process.argv[2]), '127.0.0.1');\n");
  // The bare command name and a relative script path on Windows, which starts the server through a shell.
  const start = (fn) => lib.withServer(WINDOWS ? 'node' : process.execPath, ['server.mjs', String(port)], url, fn);
  assert.equal(await start(async () => 'measured'), 'measured');
  let calls = 0;
  await assert.rejects(start(async () => {
    calls += 1;
    throw new Error('the check failed');
  }), { message: 'the check failed' });
  assert.equal(calls, 1);
  // withServer waits for the stop, so outside Windows the port refuses connections as soon as it returns.
  if (!WINDOWS) assert.equal(await answers(url), false, `${url} still answers right after withServer returned`);
  let stopped = false;
  for (let i = 0; i < 20 && !stopped; i += 1) {
    stopped = !(await answers(url));
    if (!stopped) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(stopped, `${url} still answers after withServer returned`);
});

test('prompt-plan check library: measure, baseline, and dry runs name their logs and evidence apart, latestEvidence reads only measurements, and all runs only NN-check scripts', async (t) => {
  const { repo, lib } = await planLib(t);
  const check = join(repo.dir, '.temp', 'plans', 'p', 'check');
  cpSync(join(dirname(LIB), 'check-all.mjs'), join(check, 'all.mjs'));
  // Baseline and dry-run evidence of area, and the measurements of area-wide, sort after the measurements of area:
  // reading any of them as one would return the wrong file.
  writeFileSync(join(check, '02-measure.mjs'), "import { writeFileSync } from 'node:fs';\n"
    + "import { condition, evidenceFile, runChecks } from './lib.mjs';\n"
    + "for (const name of ['area', 'area-wide']) writeFileSync(evidenceFile('02', name, 'json'), '{}');\n"
    + "runChecks('02', [condition('M1', 'measured', true)]);\n");
  writeFileSync(join(check, '01-check.mjs'), "import { condition, runChecks } from './lib.mjs';\n"
    + "runChecks('01', [condition('C1', 'checked', true)]);\n");
  writeFileSync(join(check, 'helpers.mjs'), "import { writeFileSync } from 'node:fs';\n"
    + "writeFileSync(new URL('helpers-ran', import.meta.url), '');\n");
  const node = (script, ...flags) => spawnSync(process.execPath, [join(check, script), ...flags], { cwd: repo.dir, encoding: 'utf8' });
  for (const flags of [[], ['--dry-run'], ['--baseline'], []]) assert.equal(node('02-measure.mjs', ...flags).status, 0, `run with ${flags}`);
  assert.equal(node('02-measure.mjs', '--baseline', '--dry-run').status, 2);
  assert.equal(node('all.mjs').status, 0);
  assert.equal(node('all.mjs', '--dry-run').status, 2);
  assert.equal(existsSync(join(check, 'helpers-ran')), false, 'all ran helpers.mjs');
  const files = readdirSync(lib.reviewDir);
  const named = (pattern) => files.filter((file) => pattern.test(file)).sort();
  assert.equal(named(/^01-check-[\dT-]+Z\.log$/).length, 1);
  assert.equal(named(/^02-measure-[\dT-]+Z\.log$/).length, 2, 'all ran the measure script');
  assert.equal(named(/^02-dry-run-[\dT-]+Z\.log$/).length, 1);
  assert.equal(named(/^02-baseline-[\dT-]+Z\.log$/).length, 1);
  assert.deepEqual(named(/^02-check-/), []);
  assert.equal(named(/^02-dry-run-area-[\dT-]+Z\.json$/).length, 1);
  assert.equal(named(/^02-baseline-area-[\dT-]+Z\.json$/).length, 1);
  const measured = named(/^02-area-[\dT-]+Z\.json$/);
  assert.equal(measured.length, 2);
  assert.equal(lib.latestEvidence('02', 'area', 'json'), join(lib.reviewDir, measured.at(-1)));
  assert.equal(lib.latestEvidence('02', 'missing', 'json'), null);
  assert.throws(() => lib.evidenceFile('02', 'baseline-area', 'json'), /never are or start with/);
  assert.throws(() => lib.latestEvidence('02', 'dry-run-area', 'json'), /never are or start with/);
  assert.throws(() => lib.latestEvidence('02', 'baseline', 'log'), /never are or start with/);
});

test('prompt-plan check library: evidence paths come relative to the project root', async (t) => {
  const { lib } = await planLib(t);
  const file = lib.evidenceFile('01', 'shot', 'png');
  const relativePath = lib.relativeToRoot(file);
  const review = join('.temp', 'plans', 'p', 'review');
  assert.ok(relativePath.startsWith(review), relativePath);
  assert.match(relativePath.slice(review.length + 1), /^01-shot-\d{4}-\d{2}-\d{2}T[\d-]+Z\.png$/);
  assert.ok(existsSync(join(lib.root, review)));
});
