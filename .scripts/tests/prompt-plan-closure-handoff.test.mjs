import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, patchPlan, run, startRepo } from './support.mjs';

const SKILLS = join(ROOT, '.agents', 'skills');
const EXECUTION = readFileSync(join(SKILLS, 'prompt-plan', 'references', 'execution.md'), 'utf8');
const REVIEW = readFileSync(join(SKILLS, 'prompt', 'references', 'implementation-prompts.md'), 'utf8');
const ok = (result) => assert.equal(result.status, 0, `${result.error ?? ''}${result.stdout}${result.stderr}`);

// The replacement has no in-memory state from the interrupted executor.
const RESUME = `
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const plan = process.argv[2];
const read = (path) => readFileSync(join(plan, path), 'utf8');
const handoff = JSON.parse(read('review/handoff.json'));
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
};
assert.equal(run('git', ['rev-parse', 'HEAD']), handoff.revision, 'base revision');
assert.deepEqual(run('git', ['diff', '--name-only', 'HEAD']).split('\\n'), handoff.paths);
assert.equal(read('build/rules.md').trim(), handoff.decision);
assert.equal(read(handoff.evidence.path).trim(), handoff.evidence.result);
const beforePath = join(plan, 'patch/01.before');
const before = read('patch/01.before');
assert.equal(before.split('\\n')[0], handoff.beforeTree);
run(process.execPath, [join(plan, handoff.nextCheck)]);
assert.equal(read('patch/01.before'), before);
assert.equal(statSync(beforePath).mtimeMs, handoff.beforeModified);
run(process.execPath, [join(plan, 'patch', 'record.mjs'), '01', 'after']);
`;

test('finding 15: a new process completes the open fragment from the written handoff', (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n' });
  const { plan, patch } = patchPlan(repo, ['01']);
  const write = (path, content) => writeFileSync(join(plan, path), content);
  for (const dir of ['check', 'review']) mkdirSync(join(plan, dir));
  for (const name of ['lib', 'state', 'report']) {
    cpSync(join(SKILLS, 'prompt-plan', 'scripts', 'node', `check-${name}.mjs`), join(plan, 'check', `${name}.mjs`));
  }
  const decision = 'D1 Keep the input file name';
  write('build/rules.md', `${decision}\n`);
  write('check/01-check.mjs', `import { readFileSync } from 'node:fs';
import { condition, runChecks } from './lib.mjs';
await runChecks('01', [condition('AC1', 'read kept.txt', readFileSync('kept.txt', 'utf8').trim() === 'resumed')]);
`);
  const nextCheck = 'check/01-check.mjs';
  const head = repo.git('rev-parse', 'HEAD');
  ok(head);
  const evidence = { path: 'review/01-input.txt', result: readFileSync(join(repo.dir, 'kept.txt'), 'utf8').trim() };
  write(evidence.path, `${evidence.result}\n`);
  ok(patch('record', '01', 'before'));
  const before = join(plan, 'patch', '01.before');
  const original = readFileSync(before, 'utf8');
  const modified = statSync(before).mtimeMs;
  repo.write('kept.txt', 'resumed\n');
  const handoff = {
    revision: head.stdout.trim(), paths: ['kept.txt'], decision, evidence, nextCheck, beforeTree: original.split('\n')[0], beforeModified: modified,
  };
  write('review/resume.mjs', RESUME);
  const resume = () => run(process.execPath, [join(plan, 'review/resume.mjs'), plan], { cwd: repo.dir, timeout: 20000 });
  write('review/handoff.json', JSON.stringify({ ...handoff, revision: 'stale' }));
  const stale = resume();
  assert.equal(stale.status, 1, stale.stderr);
  assert.match(stale.stderr, /base revision/);
  assert.equal(existsSync(join(plan, 'patch', '01.state')), false);
  assert.equal(readFileSync(before, 'utf8'), original);
  assert.equal(statSync(before).mtimeMs, modified);

  write('review/handoff.json', JSON.stringify(handoff));
  ok(resume());
  assert.equal(existsSync(before), false, 'record after consumes the original before record');
  const state = JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8'));
  assert.equal(state.beforeTree, handoff.beforeTree);
  assert.deepEqual(Object.keys(state.files), handoff.paths);
});

test('finding 15: guidance requires the executor to check the written handoff before resuming the same record', () => {
  assert.match(EXECUTION, /written handoff with the base revision, paths changed, decisions by ID, check commands and evidence, and the next exact check/);
  const replacement = EXECUTION.split('\n').find((line) => line.startsWith('- A replacement executor')) ?? '';
  assert.match(replacement, /reads the written handoff.*confirms its base revision, paths, decisions, and recorded evidence.*then starts with the next check/);
  assert.match(replacement, /Keep an existing before record.*investigate any mismatch before resuming/);
});

test('finding 16: a consecutive coordinator block keeps E2E and protected-script fragments in record order', (t) => {
  const block = ['exclusive E2E resource', 'protected-script edit', 'coordinator-only action'];
  const rule = EXECUTION.split('\n').find((line) => line.includes('Put consecutive fragments')) ?? '';
  for (const reason of block) assert.ok(rule.includes(reason), reason);
  assert.match(rule, /in a block assigned to the coordinator.*finish each record before opening the next/);

  const repo = startRepo(t);
  const { plan, patch } = patchPlan(repo, ['01', '02', '03']);
  for (const [index, reason] of block.entries()) {
    const number = `0${index + 1}`;
    const next = `0${index + 2}`;
    writeFileSync(join(plan, 'build', `${number}-step.md`), `# ${reason}\n`);
    ok(patch('record', number, 'before'));
    if (index < block.length - 1) {
      const blocked = patch('record', next, 'before');
      assert.equal(blocked.status, 1, blocked.stderr);
      assert.match(blocked.stderr, new RegExp(`Fragment ${next} cannot start while fragment ${number} has a before record and no after record`));
      assert.equal(existsSync(join(plan, 'patch', `${next}.before`)), false);
    }
    repo.write('kept.txt', `${reason}\n`);
    ok(patch('record', number, 'after'));
  }
});

test('finding 19: guidance requires a replacement reviewer to receive the unfinished pass and the original correction limit', () => {
  const handoff = { diff: '42d00d', criteria: ['AC1', 'AC2'], findings: ['AC1 met'], checks: ['build passed'], spent: 2, pending: 'AC2' };
  const rule = REVIEW.split('\n').find((line) => line.startsWith('- Reviewer handoff:')) ?? '';
  for (const [field, phrase] of Object.entries({ diff: /same diff/, criteria: /same diff and criteria/, findings: /completed findings/,
    checks: /completed findings and checks/, spent: /passes already spent/, pending: /Resume at the unfinished item within the original cycle limit/ })) {
    assert.match(rule, phrase, `${field}: ${JSON.stringify(handoff[field])}`);
  }
  const stop = REVIEW.split('\n').find((line) => line.startsWith('- Stop conditions:')) ?? '';
  assert.match(stop, /after three correction cycles.*what still fails is reported as a pending risk/, 'one remaining correction, no fourth cycle');
});
