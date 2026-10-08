// Claude Code runs each hook as `node ${CLAUDE_PROJECT_DIR}/.scripts/<script>` from the
// session's directory, which can lie in an independent repository nested in the project.
// The project's rules must not read, block, write, or delete there, while a linked worktree
// of the project's own repository stays governed. Codex starts the hooks of the repository
// the session is in, so its commands must end quietly where that one has no such script.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, hookFor, makeRepo, numbered, ruleHooks, run, runClientHook } from './support.mjs';

// A command whose effect stages a path it does not name, the case the effect hook records and judges.
const HIDDEN_STAGING = 'python tools/stage.py';

const name = (hook) => hook.args.join(' ').replace('${CLAUDE_PROJECT_DIR}/.scripts/', '');
const fire = (repo, dir, hook, input = {}) =>
  runClientHook('claude', hook, repo, { cwd: dir, input: { session_id: 'session', tool_use_id: 'call', cwd: dir, ...input } });
const edit = (dir) => ({ tool_input: { file_path: join(dir, 'big.mjs') } });
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const outcome = (result) =>
  result.status === 0 && result.stdout === '' && result.stderr === '' ? 'silent' : `exit ${result.status}: ${result.stdout}${result.stderr}`.trim();

// An independent project inside the fixture, not ignored by it, with something for each rule to act on.
function nestedProject(repo) {
  const nested = join(repo.dir, 'nested');
  assert.equal(repo.git('init', '-q', 'nested').status, 0);
  repo.write('nested/README.md', '[missing](missing.md)\n');
  repo.write('nested/.agents/instructions/01-long.md', numbered(26));
  const blob = run('git', ['hash-object', '-w', '--stdin'], { cwd: nested, input: 'target' }).stdout.trim();
  repo.git('-C', 'nested', 'update-index', '--add', '--cacheinfo', `120000,${blob},skills-link`);
  repo.write('nested/skills-link', 'target');
  repo.git('-C', 'nested', 'add', '--', 'README.md', '.agents');
  assert.equal(repo.git('-C', 'nested', 'commit', '-q', '-m', 'nested').status, 0);
  mkdirSync(join(nested, 'empty'));
  return nested;
}

test('claude: no hook reads, blocks, writes, or deletes in an independent repository nested in the project', (t) => {
  const repo = makeRepo(t);
  const nested = nestedProject(repo);
  const observed = {};
  const fireAt = (event, hook, input) => {
    observed[`${event} ${name(hook)}`] = outcome(fire(repo, nested, hook, input));
  };
  const step = (event, script, input) => fireAt(event, hookFor('claude', event, script), input);

  for (const hook of ruleHooks('claude', 'UserPromptSubmit')) fireAt('UserPromptSubmit', hook);
  // The edit comes after the turn started, so the turn-end pass would see it.
  repo.write('nested/big.mjs', numbered(151));
  step('PreToolUse', 'check-staging.mjs', bash('git add -A'));
  step('PreToolUse', 'check-staging-effect.mjs', bash(HIDDEN_STAGING));
  assert.equal(repo.git('-C', 'nested', 'add', '--', 'big.mjs').status, 0);
  step('PostToolUse', 'check-file-length.mjs', edit(nested));
  step('PostToolUse', 'check-staging-effect.mjs', bash(HIDDEN_STAGING));
  step('Stop', 'check-file-length.mjs', { stop_hook_active: false });

  const quiet = Object.fromEntries(Object.keys(observed).map((hook) => [hook, 'silent']));
  observed['nested/empty'] = existsSync(join(nested, 'empty')) ? 'kept' : 'removed';
  observed['nested/.temp'] = existsSync(join(nested, '.temp')) ? 'created' : 'absent';
  assert.deepEqual(observed, { ...quiet, 'nested/empty': 'kept', 'nested/.temp': 'absent' });
});

test('claude: the project and its linked worktrees stay governed', (t) => {
  const repo = makeRepo(t);
  repo.git('add', '--', '.gitignore');
  assert.equal(repo.git('commit', '-q', '-m', 'base').status, 0);
  const linked = join(repo.dir, '.temp', 'linked');
  assert.equal(repo.git('worktree', 'add', '-q', linked, '-b', 'linked').status, 0);
  const hook = hookFor('claude', 'PostToolUse', 'check-file-length.mjs');
  for (const dir of [repo.dir, linked]) {
    writeFileSync(join(dir, 'big.mjs'), numbered(151));
    const result = fire(repo, dir, hook, edit(dir));
    assert.equal(result.status, 2, `${dir}: ${outcome(result)}`);
    assert.match(result.stderr, /big\.mjs \(151 lines, new\)/);
  }
  // A session that reaches the project through another spelling of its path, such as a symlink, is still in it.
  if (!WINDOWS) {
    const alias = join(repo.dir, '.temp', 'alias');
    symlinkSync(repo.dir, alias);
    const staging = fire(repo, alias, hookFor('claude', 'PreToolUse', 'check-staging.mjs'), bash('git add -A'));
    assert.equal(staging.status, 2, outcome(staging));
  }
});

test('claude: a command from a nested repository that may reach the project is still checked', (t) => {
  const repo = makeRepo(t);
  const nested = nestedProject(repo);
  const hook = hookFor('claude', 'PreToolUse', 'check-staging.mjs');
  for (const command of [`git -C ${repo.dir} add -A`, 'cd .. && git add -A', `git --git-dir=${join(repo.dir, '.git')} add .`]) {
    assert.equal(fire(repo, nested, hook, bash(command)).status, 2, command);
  }
});

test('claude: with GIT_DIR set, as git hooks run, the project stays governed', (t) => {
  const repo = makeRepo(t);
  writeFileSync(join(repo.dir, 'big.mjs'), numbered(151));
  process.env.GIT_DIR = '.git';
  try {
    const result = fire(repo, repo.dir, hookFor('claude', 'PostToolUse', 'check-file-length.mjs'), edit(repo.dir));
    assert.equal(result.status, 2, outcome(result));
  } finally {
    delete process.env.GIT_DIR;
  }
});

test('codex: both forms of every rule hook end quietly in a repository without these scripts', (t) => {
  const repo = makeRepo(t);
  const nested = nestedProject(repo);
  const input = JSON.stringify({ session_id: 'session', tool_use_id: 'call', cwd: nested, ...bash('git add -A') });
  const observed = {};
  for (const event of ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop']) {
    for (const hook of ruleHooks('codex', event)) {
      const script = hook.command.match(/[\w-]+\.mjs/)[0];
      // On Windows the client runs commandWindows through cmd.exe. Elsewhere sh runs both forms: the
      // JavaScript of commandWindows holds nothing sh reads inside double quotes, so its logic is checked too.
      const runs = WINDOWS
        ? [['commandWindows', () => runClientHook('codex', hook, repo, { cwd: nested, input: JSON.parse(input) })]]
        : [hook.command, hook.commandWindows].filter(Boolean).map((command, i) => [i ? 'commandWindows' : 'command', () => run('/bin/sh', ['-c', command], { cwd: nested, input })]);
      for (const [form, start] of runs) observed[`${event} ${form} ${script}`] = outcome(start());
    }
  }
  const quiet = Object.fromEntries(Object.keys(observed).map((key) => [key, 'silent']));
  assert.deepEqual(observed, quiet);
  assert.equal(existsSync(join(nested, 'empty')), true);
});

test('claude: scripts started from a linked worktree govern its repository and skip a nested one', (t) => {
  const repo = makeRepo(t);
  repo.git('add', '--', '.gitignore', '.scripts');
  assert.equal(repo.git('commit', '-q', '-m', 'base').status, 0);
  const linked = join(repo.dir, '.temp', 'linked');
  assert.equal(repo.git('worktree', 'add', '-q', linked, '-b', 'linked').status, 0);
  const nested = nestedProject(repo);
  // ${CLAUDE_PROJECT_DIR} is the worktree, whose .git is a file, so the scripts ask git for their repository.
  const fromLinked = { ...repo, dir: linked };
  const hook = hookFor('claude', 'PostToolUse', 'check-file-length.mjs');
  for (const dir of [linked, repo.dir, nested]) writeFileSync(join(dir, 'big.mjs'), numbered(151));
  assert.equal(fire(fromLinked, linked, hook, edit(linked)).status, 2);
  assert.equal(fire(fromLinked, repo.dir, hook, edit(repo.dir)).status, 2);
  assert.equal(outcome(fire(fromLinked, nested, hook, edit(nested))), 'silent');
});
