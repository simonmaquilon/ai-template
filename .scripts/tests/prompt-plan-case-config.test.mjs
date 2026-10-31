// core.ignorecase can be false on a file system that does ignore case, such as a repository created where names differ
// by case and copied there: git then takes notes.md and NOTES.md for two files while the disk holds one, git mv -f of
// one to the other gets past git's own refusal, and Git for Windows takes a file renamed only in case for deleted. So
// prompt-plan's record, apply, and revert refuse to run under that configuration, or with the setting unset, which git
// reads as false, before writing anything, until git config core.ignorecase true sets it as git sets it on such a file
// system; the case probe answers whatever it says.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { patchPlan, run, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const refusedForConfig = (result) => {
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /^Refusing to run: core\.ignorecase is not true, and git reads it as false when it is unset, but the file system that holds the working tree ignores case[^\n]*git config core\.ignorecase true, and run again\.$/m);
  assert.doesNotMatch(result.stderr, /^\s+at /m, 'the refusal carries a stack trace');
};

function ignoresCase(dir) {
  writeFileSync(join(dir, 'Probe'), '');
  const found = existsSync(join(dir, 'probe'));
  rmSync(join(dir, 'Probe'));
  return found;
}

// A repository on a file system that ignores case; null where the file system tells names apart by case, where
// core.ignorecase=false is right.
function started(t) {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'notes.md': 'notes\n' });
  if (!ignoresCase(repo.dir)) {
    t.skip('this file system tells names apart by case');
    return null;
  }
  return { repo, ...patchPlan(repo, ['01']) };
}

test('prompt-plan case config: record, apply, and revert refuse core.ignorecase false or unset on a file system that ignores case, and write nothing', (t) => {
  const context = started(t);
  if (!context) return;
  const { repo, plan, patch } = context;
  const configure = (value) => ok(repo.git('config', 'core.ignorecase', value));
  const kept = () => readFileSync(join(repo.dir, 'kept.txt'), 'utf8');
  // A repository copied from a file system that tells names apart has the setting unset, which git reads as false.
  for (const setting of [['config', '--unset', 'core.ignorecase'], ['config', 'core.ignorecase', 'false']]) {
    ok(repo.git(...setting));
    refusedForConfig(patch('record', '01', 'before'));
    assert.equal(existsSync(join(plan, 'patch', '01.before')), false);
  }
  configure('true');
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'changed\n');
  configure('false');
  for (const phase of ['after', 'restore']) refusedForConfig(patch('record', '01', phase));
  assert.equal(kept(), 'changed\n');
  configure('true');
  ok(patch('record', '01', 'after'));
  configure('false');
  for (const script of ['revert', 'apply']) refusedForConfig(patch(script, '01'));
  assert.equal(kept(), 'changed\n');
  configure('true');
  ok(patch('revert', '01'));
  assert.equal(kept(), 'before\n');
  ok(patch('apply', '01'));
  assert.equal(kept(), 'changed\n');
});

// The answer comes from the file system, not from a file the scripts write.
test('prompt-plan case config: ignoresCase and pathKey fold case on such a file system, whatever the configuration says', (t) => {
  const context = started(t);
  if (!context) return;
  const { repo, plan } = context;
  ok(repo.git('config', 'core.ignorecase', 'false'));
  const script = `import { pathToFileURL } from 'node:url';
const common = await import(pathToFileURL(${JSON.stringify(join(plan, 'patch', 'common.mjs'))}).href);
console.log(JSON.stringify([common.ignoresCase(), common.pathKey('Docs/Notes.MD') === common.pathKey('docs/notes.md')]));`;
  const answered = run(process.execPath, ['--input-type=module', '-e', script], { cwd: repo.dir });
  ok(answered);
  assert.equal(answered.stdout.trim(), '[true,true]');
  assert.equal(repo.git('status', '--short').stdout.trim(), '');
});
