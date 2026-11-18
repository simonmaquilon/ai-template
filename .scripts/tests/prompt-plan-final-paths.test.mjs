import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { makePlan } from './prompt-plan-cache-plan.mjs';
import { checkStatus } from '../../.agents/skills/prompt-plan/scripts/node/check-report.mjs';
import { readLog } from '../../.agents/skills/prompt-plan/scripts/node/check-state.mjs';

const evidence = (plan) => JSON.parse(readFileSync(join(plan, 'review', 'final-run.json'), 'utf8'));

test('prompt-plan final: only the cited criterion result supports its report line', (t) => {
  const { all, node, plan, repo } = makePlan(t, { scripts: {
    '01': "import { condition, pending, runChecks } from './lib.mjs';\n"
      + "runChecks('01', [condition('AC1', 'measured', true), pending('AC2', 'Not run')]);\n",
  } });
  assert.equal(all(['--final']).status, 0);
  const review = join(plan, 'review');
  const log = readdirSync(review).find((name) => /^02-check-.*\.log$/.test(name));
  const report = join(review, 'report.md');
  const lines = ['+ ✅ [AC1] verified [[run:final-run.json]]', '1. ✅ AC2 verified [[run:final-run.json]]',
    `2) ✅ AC3 verified [[run:${log}]]`];
  writeFileSync(report, `${lines.join('\n')}\n`);
  assert.equal(checkStatus(repo.dir, plan).diagnostics.length, 2);
  assert.equal(node('report.mjs', ['--refresh']).status, 0);
  assert.equal(readFileSync(report, 'utf8'), `${lines.map((line, index) => index ? line.replace('✅', '⏳') : line).join('\n')}\n`);
});

test('prompt-plan final: an empty check inventory cannot authenticate a completed closure', (t) => {
  const { all, check, plan, repo } = makePlan(t);
  for (const file of readdirSync(check).filter((name) => /^\d{2}-check\.mjs$/.test(name))) rmSync(join(check, file));
  mkdirSync(join(plan, 'build'));
  writeFileSync(join(plan, 'build', '01-close.md'), '# Close\n<!-- check: final -->\n');
  writeFileSync(join(plan, 'build', '00-index.md'), '| [01](01-close.md) | Close | done |\n');
  const result = all(['--final']);
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /no checks/i);
  const record = evidence(plan);
  assert.equal(record.status, 'incomplete');
  writeFileSync(join(plan, 'review', 'final-run.json'), JSON.stringify({ ...record, status: 'passed' }));
  assert.match(checkStatus(repo.dir, plan).diagnostics.join('\n'), /completed closure needs fresh passing/);
});

test('prompt-plan final: a changed assumption consumed by a check reopens the closure', (t) => {
  const { all, plan, repo } = makePlan(t, { scripts: {
    '03': "import { readFileSync } from 'node:fs';\nimport { condition, runChecks } from './lib.mjs';\n"
      + "const { contract } = JSON.parse(readFileSync(new URL('../build/03-assumptions.json', import.meta.url)));\n"
      + "runChecks('03', [condition('C', 'contract', contract === 'present')]);\n",
  } });
  mkdirSync(join(plan, 'build'));
  writeFileSync(join(plan, 'build', '03-close.md'), '# Close\n<!-- check: final -->\n');
  const assumptions = join(plan, 'build', '03-assumptions.json');
  const index = join(plan, 'build', '00-index.md');
  writeFileSync(assumptions, JSON.stringify({ contract: 'present' }));
  writeFileSync(index, '| [03](03-close.md) | Close | pending |\n');
  assert.equal(all(['--final']).status, 0);
  writeFileSync(index, '| [03](03-close.md) | Close | done |\n');
  assert.deepEqual(checkStatus(repo.dir, plan).diagnostics, []);
  writeFileSync(assumptions, JSON.stringify({ contract: 'removed' }));
  assert.match(checkStatus(repo.dir, plan).diagnostics.join('\n'), /completed closure needs fresh passing/);
});

test('prompt-plan final: oversized closure metadata reopens the cited completion', (t) => {
  const { all, node, plan, repo } = makePlan(t);
  mkdirSync(join(plan, 'build'));
  writeFileSync(join(plan, 'build', '03-close.md'), '# Close\n<!-- check: final -->\n');
  writeFileSync(join(plan, 'build', '00-index.md'), '| [03](03-close.md) | Close | done |\n');
  const result = all(['--final']);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  const receipt = join(plan, 'review', 'final-run.json');
  const report = join(plan, 'review', 'report.md');
  const claim = '✅ All closure checks passed [[run:final-run.json]]\n';
  writeFileSync(report, claim);
  assert.deepEqual(checkStatus(repo.dir, plan).diagnostics, []);

  writeFileSync(receipt, `${readFileSync(receipt, 'utf8')}${' '.repeat(1024 ** 2)}`);
  const { diagnostics } = checkStatus(repo.dir, plan);
  assert.match(diagnostics.join('\n'), /completed closure needs fresh passing/);
  assert.match(diagnostics.join('\n'), /stale or mismatched run evidence/);
  assert.equal(readFileSync(report, 'utf8'), claim);
  assert.equal(node('report.mjs', ['--refresh']).status, 0);
  assert.match(readFileSync(report, 'utf8'), /^⏳ All closure checks/);
});

test('prompt-plan final: reports a complete multi-chunk log and refuses invalid exits and oversized logs', (t) => {
  const { all, plan, repo } = makePlan(t, { scripts: {
    '03': "import { condition, runChecks } from './lib.mjs';\nrunChecks('03', [condition('C', 'line', true, 'a'.repeat(1024 ** 2))]);\n",
  } });
  const result = all(['--final']);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  const name = readdirSync(join(plan, 'review')).find((file) => /^03-check-.*\.log$/.test(file));
  const log = join(plan, 'review', name);
  assert.ok(readFileSync(log).length > 1024 ** 2);
  writeFileSync(join(plan, 'review', 'report.md'), `✅ Check passed [[run:${name}]]\n`);
  assert.deepEqual(checkStatus(repo.dir, plan).diagnostics, []);

  const receipt = log.replace(/\.log$/, '.json');
  const metadata = JSON.parse(readFileSync(receipt, 'utf8'));
  const changed = readFileSync(log, 'utf8').replace(/## EXIT 0\n$/, '## EXIT 1\n');
  writeFileSync(log, changed);
  writeFileSync(receipt, JSON.stringify({ ...metadata, sha256: createHash('sha256').update(changed).digest('hex') }));
  assert.match(checkStatus(repo.dir, plan).diagnostics.join('\n'), /stale or mismatched/);
  truncateSync(log, 64 * 1024 ** 2 + 1);
  assert.throws(() => readLog(plan, `review/${name}`), /exceeds its size limit/);
});

test('prompt-plan final: replacing a tracked file with a directory and vice versa remains measurable', (t) => {
  const { all, plan, repo } = makePlan(t);
  repo.write('old-dir/child.txt', 'old child');
  assert.equal(repo.git('add', 'old-dir/child.txt').status, 0);
  assert.equal(repo.git('commit', '-qm', 'add a tracked directory').status, 0);
  assert.equal(all(['--final']).status, 0);
  const original = evidence(plan).before;
  rmSync(join(repo.dir, 'kept.txt'));
  repo.write('kept.txt/replacement.txt', 'new child');
  rmSync(join(repo.dir, 'old-dir'), { recursive: true });
  repo.write('old-dir', 'a regular file now');
  const result = all(['--final']);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.notEqual(evidence(plan).before, original);
});
