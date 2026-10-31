// How the check runner that the prompt-plan skill copies into every plan, all, saves time: it repeats the slow lines
// of earlier fragments only with --slow, and a command several checks need is reused within a run once it succeeds.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { ROOT, WINDOWS, makeRepo } from './support.mjs';

const BUNDLED = join(ROOT, '.agents', 'skills', 'prompt-plan', 'scripts', 'node');
const NODE = process.execPath;

// A plan with lib and all, and two checks. Each runs a counted command through runOnce, a command that fails on its
// first run and then succeeds, reports whether it skips slow lines, and has a slow pending line; 01's slow line fails.
function makePlan(t) {
  const repo = makeRepo(t);
  const check = join(repo.dir, '.temp', 'plans', 'p', 'check');
  mkdirSync(check, { recursive: true });
  cpSync(join(BUNDLED, 'check-lib.mjs'), join(check, 'lib.mjs'));
  cpSync(join(BUNDLED, 'check-all.mjs'), join(check, 'all.mjs'));
  repo.write('count.mjs', "import { appendFileSync } from 'node:fs';\nappendFileSync(`.temp/${process.argv[2]}.txt`, 'x');\n");
  repo.write('flaky.mjs', "import { appendFileSync, existsSync } from 'node:fs';\n"
    + "const ran = existsSync('.temp/flaky.txt');\nappendFileSync('.temp/flaky.txt', 'x');\nprocess.exit(ran ? 0 : 1);\n");
  for (const [number, failing] of [['01', true], ['02', false]]) {
    writeFileSync(join(check, `${number}-check.mjs`), "import { condition, pending, runChecks, runOnce, skipSlow, slow } from './lib.mjs';\n"
      + `const once = runOnce('count', ${JSON.stringify(NODE)}, ['count.mjs', 'count']);\n`
      + `runOnce('flaky', ${JSON.stringify(NODE)}, ['flaky.mjs']);\n`
      + `console.log('skipSlow ${number}', skipSlow);\n`
      + `runChecks('${number}', [condition('C', 'counted', once.status === 0), slow(condition('S', 'slow', ${!failing})), slow(pending('P', 'pending'))]);\n`);
  }
  // A clean environment, as when the user runs a script: no variable of an all run that might contain this test.
  const env = { ...process.env };
  delete env.PROMPT_PLAN_RUN;
  delete env.PROMPT_PLAN_SKIP_SLOW;
  const node = (script, args = [], extra = {}) => spawnSync(process.execPath, [join(check, script), ...args], { cwd: repo.dir, encoding: 'utf8', env: { ...env, ...extra } });
  const runs = (name) => (existsSync(join(repo.dir, '.temp', `${name}.txt`)) ? readFileSync(join(repo.dir, '.temp', `${name}.txt`), 'utf8').length : 0);
  return { repo, check, node, runs };
}

test('prompt-plan all: all NN skips the slow lines of earlier fragments, and --slow or a direct run repeats them', (t) => {
  const { node } = makePlan(t);
  const quick = node('all.mjs', ['02']);
  assert.equal(quick.status, 0, `${quick.stdout}${quick.stderr}`);
  assert.match(quick.stdout, /skipSlow 01 true/);
  assert.match(quick.stdout, /skipSlow 02 false/);
  assert.match(quick.stdout, /SKIPPED S: slow/);
  assert.match(quick.stdout, /PENDING P: pending/);
  assert.match(quick.stdout, /Fragment 01: 0 failing, 1 skipped/);
  assert.equal(node('all.mjs', ['02', '--slow']).status, 1, 'the failing slow line of 01 runs with --slow');
  assert.equal(node('all.mjs').status, 1, 'all without a fragment runs every line');
  assert.equal(node('01-check.mjs').status, 1, 'a direct run repeats its slow lines');
  for (const flag of ['--dry-run', '--baseline']) {
    assert.equal(node('01-check.mjs', [flag], { PROMPT_PLAN_SKIP_SLOW: '1' }).status, 1, `a ${flag} run never skips`);
  }
  for (const args of [['--slow', '02', '03'], ['00'], ['0']]) assert.equal(node('all.mjs', args).status, 2, args.join(' '));
});

test('prompt-plan all: runOnce reuses only a successful result, within one all run, and never in the commands it runs', (t) => {
  const { check, node, runs } = makePlan(t);
  assert.equal(node('all.mjs', ['02', '--slow']).status, 1);
  assert.equal(runs('count'), 1, 'one run of all ran the command once for both checks');
  assert.equal(runs('flaky'), 2, 'a failed result is not reused');
  assert.equal(node('all.mjs', ['02']).status, 0);
  assert.equal(runs('count'), 2, 'a new run of all runs it again');
  node('01-check.mjs');
  node('02-check.mjs');
  assert.equal(runs('count'), 4, 'direct runs run it every time');
  const cache = join(check, '..', '.cache', 'once');
  assert.deepEqual(existsSync(cache) ? readdirSync(cache) : [], [], 'all leaves no shared result behind');
  const leaked = spawnSync(process.execPath, ['-e', "import('./lib.mjs').then((lib) => console.log(JSON.stringify(lib.toolEnv())))"],
    { cwd: check, encoding: 'utf8', env: { ...process.env, PROMPT_PLAN_RUN: 'r', PROMPT_PLAN_SKIP_SLOW: '1' } });
  const env = JSON.parse(leaked.stdout);
  assert.equal(env.PROMPT_PLAN_RUN, undefined);
  assert.equal(env.PROMPT_PLAN_SKIP_SLOW, undefined);
});

test('prompt-plan lib: commands get their arguments literally, and on Windows lib refuses those cmd.exe cannot pass', (t) => {
  const { repo, check, node } = makePlan(t);
  repo.write('args.mjs', 'console.log(JSON.stringify(process.argv.slice(2)));\n');
  const literal = ['two words', 'a&b|c<d>e(f)^g', '', 'C:\\dir\\', '*'];
  const unsafe = ['50%', 'say "hi"', 'a!b', 'x\ny'];
  writeFileSync(join(check, 'args-run.mjs'), "import { runOnce } from './lib.mjs';\n"
    + `const run = (args) => runOnce('args', ${JSON.stringify(NODE)}, ['args.mjs', ...args]);\n`
    + `console.log(JSON.stringify([run(${JSON.stringify(literal)}), ...${JSON.stringify(unsafe)}.map((arg) => run([arg]))]));\n`);
  const result = node('args-run.mjs');
  assert.equal(result.status, 0, result.stderr);
  const [passed, ...refused] = JSON.parse(result.stdout);
  const received = (outcome) => JSON.parse(outcome.output.trim().split('\n').at(-1));
  assert.equal(passed.status, 0, passed.output);
  assert.deepEqual(received(passed), literal);
  for (const [index, outcome] of refused.entries()) {
    if (!WINDOWS) assert.deepEqual(received(outcome), [unsafe[index]]);
    else assert.deepEqual([outcome.status, /cannot pass/.test(outcome.output)], [null, true], outcome.output);
  }
});

test('prompt-plan lib: isolateHome on Windows also moves USERPROFILE, APPDATA, and LOCALAPPDATA into the plan cache', (t) => {
  const { check } = makePlan(t);
  // lib reads the platform when it loads, so a platform set before it loads takes its Windows branch anywhere.
  const windows = `data:text/javascript,${encodeURIComponent('Object.defineProperty(process, "platform", { value: "win32" })')}`;
  const shown = spawnSync(process.execPath, ['--import', windows, '-e',
    "import('./lib.mjs').then((lib) => console.log(JSON.stringify(lib.toolEnv({ isolateHome: true }))))"], { cwd: check, encoding: 'utf8' });
  assert.equal(shown.status, 0, shown.stderr);
  const env = JSON.parse(shown.stdout);
  const cache = resolve(check, '..', '.cache');
  for (const name of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
    assert.ok(resolve(env[name] ?? '').startsWith(cache), `${name}: ${env[name]}`);
    assert.ok(existsSync(env[name]), `${name} was not created`);
  }
});

test('prompt-plan all: a command or a condition that covers an open decision reports PENDING with its result', (t) => {
  const { check, node } = makePlan(t);
  writeFileSync(join(check, '03-check.mjs'), "import { command, condition, runChecks } from './lib.mjs';\n"
    + `runChecks('03', [command('A', 'command', ${JSON.stringify(NODE)}, ['-e', 'process.exit(1)'], { reportPending: true }),\n`
    + "  condition('B', 'condition', false, 'measured', { reportPending: true })]);\n");
  const result = node('03-check.mjs');
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /PENDING A: command/);
  assert.match(result.stdout, /PENDING B: condition/);
});
