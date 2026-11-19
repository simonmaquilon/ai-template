// A plan whose fragment 01 declares one test path and has its before record, for the red evidence tests: the copied
// patch scripts, the evidence helper, the check library with its state helper, and a committed repository.
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makePlan } from './prompt-plan-cache-plan.mjs';
import { ROOT, run } from './support.mjs';

export function recorded(t, { change = true } = {}) {
  const context = makePlan(t);
  const { check, plan, repo } = context;
  const source = join(ROOT, '.agents', 'skills', 'prompt-plan', 'scripts', 'node');
  mkdirSync(join(plan, 'patch'));
  mkdirSync(join(plan, 'build'));
  for (const name of ['common', 'record']) cpSync(join(source, `${name}.mjs`), join(plan, 'patch', `${name}.mjs`));
  cpSync(join(source, 'check-evidence.mjs'), join(check, 'evidence.mjs'));
  writeFileSync(join(plan, 'build', '01-step.md'), '# 01\n<!-- test-path: behavior.test.mjs -->\n');
  const record = (...args) => run(process.execPath, [join(plan, 'patch', 'record.mjs'), '01', ...args], { cwd: repo.dir });
  const before = record('before');
  assert.equal(before.status, 0, `${before.stdout}${before.stderr}`);
  if (change) repo.write('behavior.test.mjs', "console.log('BEGIN full stdout\\ntoken=synthetic-red-token');\nconsole.error('EXPECTED behavior assertion\\nEND full stderr');\nprocess.exitCode = 1;\n");
  const red = (expected = 'EXPECTED behavior assertion', testPath = 'behavior.test.mjs') => context.node('evidence.mjs', [
    '01', 'red', '--test-path', testPath, '--expect', expected, '--', process.execPath, 'behavior.test.mjs',
  ]);
  const names = () => existsSync(join(plan, 'review')) ? readdirSync(join(plan, 'review')) : [];
  const outcome = () => JSON.parse(readFileSync(join(plan, 'review', names().find((name) => name.endsWith('.json'))), 'utf8'));
  return { red, names, outcome, plan, repo, node: context.node, record, after: (...extra) => record('after', ...extra) };
}
