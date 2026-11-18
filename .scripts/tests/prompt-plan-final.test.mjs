import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { makePlan } from './prompt-plan-cache-plan.mjs';
import { ROOT, WINDOWS } from './support.mjs';
import { checkStatus } from '../../.agents/skills/prompt-plan/scripts/node/check-report.mjs';

const evidence = (plan) => JSON.parse(readFileSync(join(plan, 'review', 'final-run.json'), 'utf8'));

test('prompt-plan final: the standalone run bypasses the pass cache and records each fresh check', (t) => {
  const { all, cached, plan, repo, runs } = makePlan(t);
  assert.equal(all(['03']).status, 0);
  assert.deepEqual(cached(all(['03'])), ['01', '02']);
  const final = all(['--final']);
  assert.equal(final.status, 0, `${final.stdout}${final.stderr}`);
  assert.deepEqual(cached(final), []);
  assert.deepEqual(runs(), [2, 2, 3]);
  const saved = evidence(plan);
  assert.equal(saved.version, 1);
  assert.equal(saved.status, 'passed');
  assert.equal(saved.before, saved.after);
  assert.equal(saved.state.before.revision, repo.git('rev-parse', 'HEAD').stdout.trim());
  assert.match(saved.state.before.project, /^[a-f0-9]{64}$/);
  assert.match(saved.state.before.checks, /^[a-f0-9]{64}$/);
  assert.deepEqual(saved.state.before, saved.state.after);
  assert.deepEqual(saved.fragments.map(({ number, status }) => [number, status]), [['01', 'passed'], ['02', 'passed'], ['03', 'passed']]);
  for (const { logs } of saved.fragments) {
    assert.equal(logs.length, 1);
    assert.match(readFileSync(join(plan, 'review', logs[0].name), 'utf8'), /## EXIT 0\n$/);
  }
  for (const args of [['03', '--final'], ['--slow', '--final'], ['--final', '--final']]) assert.equal(all(args).status, 2);
});

test('prompt-plan final: missing, interrupted and incomplete output cannot pass', (t) => {
  const { all, plan } = makePlan(t, { scripts: { '02': 'console.log("No result");\n' } });
  mkdirSync(join(plan, 'build'));
  writeFileSync(join(plan, 'build', '04-required.md'), '# 04\n<!-- check: required -->\n');
  const final = all(['--final'], { BREAK: 'kill' });
  assert.equal(final.status, 1, `${final.stdout}${final.stderr}`);
  const stopped = WINDOWS ? 'incomplete' : 'interrupted';
  assert.deepEqual(evidence(plan).fragments.map(({ status }) => status), [stopped, 'incomplete', 'passed', 'missing']);
});

test('prompt-plan final: changes during a run make the new evidence stale', (t) => {
  const { all, plan } = makePlan(t, { scripts: { '03': [
    "import { writeFileSync } from 'node:fs';",
    "import { condition, root, runChecks } from './lib.mjs';",
    "import { join } from 'node:path';",
    "writeFileSync(join(root, 'kept.txt'), 'changed while checking');",
    "runChecks('03', [condition('C', 'line', true)]);",
  ].join('\n') } });
  const final = all(['--final']);
  assert.equal(final.status, 1, `${final.stdout}${final.stderr}`);
  assert.equal(evidence(plan).status, 'stale');
  assert.notEqual(evidence(plan).before, evidence(plan).after);
});

test('prompt-plan final: refresh reopens a stale claim and keeps partial metadata and wording', (t) => {
  const { all, node, repo, plan } = makePlan(t);
  assert.equal(all(['--final']).status, 0);
  const review = join(plan, 'review');
  const report = join(review, 'report.md');
  const claim = '✅ All closure checks passed [[run:final-run.json]]\n';
  writeFileSync(report, `${claim}⏳ [partial] C2 · 02 · explanation\n`);
  assert.equal(node('report.mjs', ['--refresh']).status, 0);
  assert.equal(readFileSync(report, 'utf8').split('\n')[0], claim.trimEnd());
  for (const update of [() => {
    repo.write('kept.txt', 'staged body');
    assert.equal(repo.git('add', 'kept.txt').status, 0);
    repo.write('kept.txt', 'before\n');
  }, () => {
    if (!WINDOWS) chmodSync(join(repo.dir, 'kept.txt'), 0o755);
    else repo.write('new.txt', 'untracked');
  }]) {
    assert.equal(all(['--final']).status, 0);
    writeFileSync(report, `${claim}⏳ [partial] C2 · 02 · explanation\n`);
    update();
    const result = node('report.mjs', ['--refresh']);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(readFileSync(report, 'utf8'), /^⏳ All closure checks/m);
  }
  assert.match(readFileSync(report, 'utf8'), /^⏳ \[partial\] C2 .*explanation/m);
  assert.match(node('report.mjs').stdout, /⏳ Parcial/);
});

test('prompt-plan final: the read-only evaluator requires fresh closure evidence and never runs a plan script', (t) => {
  const { all, check, plan, repo } = makePlan(t);
  mkdirSync(join(plan, 'build'));
  writeFileSync(join(plan, 'build', '04-closure.md'), '# 04\n<!-- check: final -->\n');
  writeFileSync(join(plan, 'build', '00-index.md'), '| [04](04-closure.md) | Closure | done |\n');
  assert.match(checkStatus(repo.dir, plan).diagnostics.join('\n'), /completed closure/);
  assert.equal(all(['--final']).status, 0);
  assert.deepEqual(checkStatus(repo.dir, plan), { active: true, diagnostics: [] });

  const malicious = join(check, '03-check.mjs');
  writeFileSync(malicious, 'throw new Error("checkStatus executed plan code");\n');
  const receipt = readFileSync(join(plan, 'review', 'final-run.json'), 'utf8');
  assert.match(checkStatus(repo.dir, plan).diagnostics.join('\n'), /completed closure/);
  assert.equal(readFileSync(join(plan, 'review', 'final-run.json'), 'utf8'), receipt);
});

test('prompt-plan final: direct check evidence stays fresh until a relevant input changes, independent of elapsed time', (t) => {
  const { node, plan, repo } = makePlan(t);
  const review = join(plan, 'review');
  assert.equal(node('01-check.mjs').status, 0);
  const log = readdirSync(review).find((name) => /^01-check-.*\.log$/.test(name));
  const report = join(review, 'report.md');
  const pass = `- ✅ Check 01 passed [[run:${log}]]\n`;
  writeFileSync(report, pass);
  assert.deepEqual(checkStatus(repo.dir, plan).diagnostics, []);
  assert.equal(repo.git('tag', 'new-ref').status, 0);
  assert.match(checkStatus(repo.dir, plan).diagnostics.join('\n'), /stale/);
  assert.equal(readFileSync(report, 'utf8'), pass, 'the evaluator is read-only');
  assert.equal(node('report.mjs', ['--refresh']).status, 0);
  assert.match(readFileSync(report, 'utf8'), /^- ⏳ Check 01 /);
});

test('prompt-plan final: a pending result stays pending even when the run completed successfully', (t) => {
  const { all, plan, repo } = makePlan(t, { scripts: {
    '01': "import { pending, runChecks } from './lib.mjs';\nrunChecks('01', [pending('C1', 'Open decision')]);\n",
  } });
  assert.equal(all(['--final']).status, 0);
  const review = join(plan, 'review');
  const log = readdirSync(review).find((name) => /^01-check-.*\.log$/.test(name));
  writeFileSync(join(review, 'report.md'), `✅ C1 [[run:${log}]]\n✅ C1 [[run:final-run.json]]\n`);
  assert.equal(checkStatus(repo.dir, plan).diagnostics.length, 2);
});

test('prompt-plan final: unreadable plan metadata is refused without replacing the report', { skip: WINDOWS }, (t) => {
  const { node, plan, repo } = makePlan(t);
  mkdirSync(join(plan, 'review'));
  const report = join(plan, 'review', 'report.md');
  const source = '✅ C1 [[run:final-run.json]]\n';
  writeFileSync(report, source);
  symlinkSync(join(ROOT, '.agents'), join(plan, 'build'));
  assert.match(checkStatus(repo.dir, plan).diagnostics.join('\n'), /Cannot safely read/);
  node('report.mjs', ['--refresh']);
  assert.equal(readFileSync(report, 'utf8'), source);
});
