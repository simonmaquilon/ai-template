// The result lib's runOnce shares within an all run is written under the plan's .cache/once: it holds the output after
// redact, so a secret a command prints never reaches that file, and a later call in the same run reads the masked text.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, makeRepo } from './support.mjs';

const LIB = join(ROOT, '.agents', 'skills', 'prompt-plan', 'scripts', 'node', 'check-lib.mjs');
const SECRET = 'ghp_' + 'A1'.repeat(18);

test('prompt-plan redact: the output runOnce keeps in .cache/once is redacted, and a later call in the run reads it masked', (t) => {
  const repo = makeRepo(t);
  const plan = join(repo.dir, '.temp', 'plans', 'p');
  mkdirSync(join(plan, 'check'), { recursive: true });
  cpSync(LIB, join(plan, 'check', 'lib.mjs'));
  repo.write('print.mjs', `console.log('Server=x;Password=s3cr3t;', ${JSON.stringify(SECRET)});\n`);
  writeFileSync(join(plan, 'check', '01-check.mjs'), "import { runOnce } from './lib.mjs';\n"
    + `const call = () => runOnce('p', ${JSON.stringify(process.execPath)}, ['print.mjs']);\n`
    + 'const first = call();\nconst second = call();\n'
    + "console.log(JSON.stringify({ first: first.output, second: second.output }));\n");
  const env = { ...process.env, PROMPT_PLAN_RUN: 'run-once-test' };
  const run = spawnSync(process.execPath, [join(plan, 'check', '01-check.mjs')], { cwd: repo.dir, encoding: 'utf8', env });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  const { first, second } = JSON.parse(run.stdout);
  assert.ok(first.includes(SECRET) && first.includes('s3cr3t'), 'the first call returns the output whole, for the check to parse');
  assert.match(second, /^\(result shared within this all run\)\n/);
  assert.match(second, /Password=\[REDACTED\];/);
  assert.match(second, /ghp_\[REDACTED\]/);
  assert.doesNotMatch(second, /s3cr3t|A1A1A1/);
  const dir = join(plan, '.cache', 'once');
  const [name, ...others] = readdirSync(dir);
  assert.equal(others.length, 0);
  const saved = readFileSync(join(dir, name), 'utf8');
  assert.doesNotMatch(saved, /s3cr3t|A1A1A1/);
  assert.match(saved, /Password=\[REDACTED\];/);
  assert.equal(JSON.parse(saved).status, 0);
});
