// The scripts that the prompt-plan skill copies into every plan, run from a plan folder inside the project, ignored or
// not, and from one outside any repository, as one in the operating system's temporary folder: they record, revert,
// apply, and check the project's work and leave the plan out of it.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, makeRepo } from './support.mjs';

const BUNDLED = join(ROOT, '.agents', 'skills', 'prompt-plan', 'scripts', 'node');

// A plan folder with the bundled scripts copied as the skill copies them, and one fragment whose check looks for
// added.txt at the project root.
function makePlan(plan) {
  for (const dir of ['build', 'patch', 'check', 'review']) mkdirSync(join(plan, dir), { recursive: true });
  for (const name of ['common', 'record', 'apply', 'revert']) cpSync(join(BUNDLED, `${name}.mjs`), join(plan, 'patch', `${name}.mjs`));
  cpSync(join(BUNDLED, 'check-lib.mjs'), join(plan, 'check', 'lib.mjs'));
  writeFileSync(join(plan, 'build', '01-change.md'), '# 01\n');
  writeFileSync(join(plan, 'check', '01-check.mjs'), "import { existsSync } from 'node:fs';\nimport { join } from 'node:path';\n"
    + "import { condition, root, runChecks } from './lib.mjs';\n"
    + "runChecks('01', [condition('AC1', 'added.txt exists at the project root', existsSync(join(root, 'added.txt')), root)]);\n");
  return plan;
}

function startRepo(t) {
  const repo = makeRepo(t);
  repo.write('kept.txt', 'before\n');
  repo.write('sub/.keep', '');
  assert.equal(repo.git('add', '-A').status, 0);
  assert.equal(repo.git('commit', '-q', '-m', 'start').status, 0);
  return repo;
}

// Records fragment 01 around a change to kept.txt and a new added.txt, running the scripts from cwd, and returns the
// paths its state records.
function recordChange(repo, plan, cwd = repo.dir) {
  const node = (script, args, from = repo.dir) => spawnSync(process.execPath, [join(plan, script), ...args], { cwd: from, encoding: 'utf8' });
  const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  ok(node(join('patch', 'record.mjs'), ['01', 'before'], cwd));
  repo.write('kept.txt', 'after\n');
  repo.write('added.txt', 'new\n');
  // From a subdirectory, the check still runs on the repository's root.
  ok(node(join('check', '01-check.mjs'), [], join(repo.dir, 'sub')));
  assert.equal(readdirSync(join(plan, 'review')).filter((name) => /^01-check-.+\.log$/.test(name)).length, 1);
  ok(node(join('patch', 'record.mjs'), ['01', 'after'], cwd));
  return { node, ok, paths: Object.keys(JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8')).files).sort() };
}

test('prompt-plan scripts: a plan outside any repository records, reverts, applies, and checks the repository they run from', (t) => {
  const repo = startRepo(t);
  // Beside the throwaway repository under .temp, where GIT_CEILING_DIRECTORIES (support.mjs) keeps git from finding any repository.
  const plan = makePlan(mkdtempSync(join(ROOT, '.temp', 'hook-test-plan-')));
  t.after(() => rmSync(plan, { recursive: true, force: true, maxRetries: 5 }));
  const { node, ok, paths } = recordChange(repo, plan);
  assert.deepEqual(paths, ['added.txt', 'kept.txt']);
  assert.match(readFileSync(join(plan, 'patch', '01.patch'), 'utf8'), /added\.txt/);

  const read = (path) => readFileSync(join(repo.dir, path), 'utf8');
  ok(node(join('patch', 'revert.mjs'), ['01']));
  assert.equal(read('kept.txt'), 'before\n');
  assert.equal(existsSync(join(repo.dir, 'added.txt')), false);
  ok(node(join('patch', 'apply.mjs'), ['all']));
  assert.equal(read('kept.txt'), 'after\n');
  assert.equal(read('added.txt'), 'new\n');
});

test('prompt-plan scripts: a plan inside the repository stays out of its own snapshots, ignored or not', (t) => {
  for (const folder of [join('.temp', 'plans', 'p'), join('plans', 'p')]) {
    const repo = startRepo(t);
    const plan = makePlan(join(repo.dir, folder));
    // From a subdirectory, the scripts find the plan's repository.
    assert.deepEqual(recordChange(repo, plan, join(repo.dir, 'sub')).paths, ['added.txt', 'kept.txt'], folder);
  }
});
