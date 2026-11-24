import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { run, ROOT } from './support.mjs';

const STORE = pathToFileURL(join(ROOT, '.scripts', 'run-lock-store.mjs')).href;
// SIMULATED: the creation of the lock file fails with the error code CODE, `FAILS` times (or always), and the process
// says it runs on win32 (PLATFORM) before the store is loaded; nothing else is simulated. Prints the answer or the error.
const CHILD = `
  import fs from 'node:fs';
  import { syncBuiltinESMExports } from 'node:module';
  if (process.env.PLATFORM) Object.defineProperty(process, 'platform', { value: process.env.PLATFORM });
  const { writeFileSync } = fs;
  let failed = 0;
  fs.writeFileSync = (path, data, options) => {
    if (options?.flag === 'wx' && String(path).endsWith('.json') && failed++ < Number(process.env.FAILS)) throw Object.assign(new Error('simulated'), { code: process.env.CODE });
    return writeFileSync(path, data, options);
  };
  syncBuiltinESMExports();
  const { acquire } = await import(process.env.STORE);
  try {
    const { ok, holder } = acquire('e2e', { dir: process.env.DIR });
    console.log(JSON.stringify({ ok, state: holder?.state }));
  } catch (error) {
    console.log(JSON.stringify({ error: error.message }));
  }
`;

function attempt(t, env) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const base = mkdtempSync(join(ROOT, '.temp', 'run-lock-errors-'));
  t.after(() => rmSync(base, { recursive: true, force: true, maxRetries: 5 }));
  const dir = join(base, 'run-locks');
  const result = run(process.execPath, ['--input-type=module', '-e', CHILD], { env: { ...process.env, STORE, DIR: dir, ...env } });
  assert.equal(result.status, 0, result.stderr);
  return { answer: JSON.parse(result.stdout.trim()), dir };
}

test('on Windows an EPERM or EACCES that persists with no holder to read is an error naming the code and the file, not a busy answer', (t) => {
  for (const CODE of ['EPERM', 'EACCES']) {
    const { answer, dir } = attempt(t, { PLATFORM: 'win32', CODE, FAILS: '1000' });
    assert.ok(answer.error?.includes(CODE) && answer.error.includes(join(dir, 'e2e.json')), JSON.stringify(answer));
  }
});

test('on Windows a transient EPERM is retried until the lock is taken', (t) => {
  const { answer } = attempt(t, { PLATFORM: 'win32', CODE: 'EPERM', FAILS: '3' });
  assert.deepEqual(answer, { ok: true });
});

test('elsewhere an EACCES is an error at once', (t) => {
  const { answer } = attempt(t, { PLATFORM: 'linux', CODE: 'EACCES', FAILS: '1' });
  assert.ok(answer.error, JSON.stringify(answer));
});
