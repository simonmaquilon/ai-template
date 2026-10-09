// The check library that the prompt-plan skill copies into every plan, exercised from a plan folder inside a
// throwaway repository, as a plan's NN-check scripts use it.

import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
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

test('prompt-plan check library: evidence paths come relative to the project root', async (t) => {
  const { lib } = await planLib(t);
  const file = lib.evidenceFile('01', 'shot', 'png');
  const relativePath = lib.relativeToRoot(file);
  const review = join('.temp', 'plans', 'p', 'review');
  assert.ok(relativePath.startsWith(review), relativePath);
  assert.match(relativePath.slice(review.length + 1), /^01-shot-\d{4}-\d{2}-\d{2}T[\d-]+Z\.png$/);
  assert.ok(existsSync(join(lib.root, review)));
});
