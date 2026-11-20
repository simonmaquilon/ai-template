import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fakeGh, withEnv } from './fake-gh.mjs';
import { ROOT, hookFor, makeRepo, run, runClientHook } from './support.mjs';
import { commit, template } from './template-manifest-fixture.mjs';

const SCRIPT = join(ROOT, '.scripts', 'check-release-ci.mjs');
const ACTIVE = [{ name: 'ci', state: 'active' }];
const STATES = {
  pending: [{ runs: [{ status: 'in_progress', conclusion: '' }] }, 'is still running'],
  failed: [{ runs: [{ status: 'completed', conclusion: 'failure' }] }, 'failed'],
  none: [{ runs: [], workflows: ACTIVE }, 'has not started a run'],
  unknown: [{ fail: ['run list'] }, 'could not be verified'],
};
const GREEN = { passed: { runs: [{ status: 'completed', conclusion: 'success' }] }, inactive: { runs: [], workflows: [] } };

// A maintained template whose tag v1 names the first commit and whose HEAD is a later one.
function project(t) {
  const repo = template(t);
  repo.git('tag', 'v1');
  repo.first = repo.git('rev-parse', 'v1').stdout.trim();
  repo.write('later.txt', 'later\n');
  commit(repo);
  repo.head = repo.git('rev-parse', 'HEAD').stdout.trim();
  return repo;
}

const fire = (client, repo, gh, command, extra = {}) => withEnv(gh.vars, () => runClientHook(client,
  hookFor(client, 'PreToolUse', 'check-release-ci.mjs'), repo, { input: { cwd: repo.dir, tool_input: { command }, ...extra } }));

// Claude Code is asked to confirm; Codex has no "ask", so its hook rejects the command with exit status 2.
function assertAsked(client, result, pattern) {
  if (client === 'claude') {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    const { hookEventName, permissionDecision, permissionDecisionReason } = JSON.parse(result.stdout).hookSpecificOutput;
    assert.deepEqual([hookEventName, permissionDecision], ['PreToolUse', 'ask']);
    assert.match(permissionDecisionReason, pattern);
  } else {
    assert.equal(result.status, 2, result.stdout);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, pattern);
  }
}
const assertSilent = (result, label) => {
  assert.equal(result.status, 0, `${label}: ${result.stderr}`);
  assert.equal(`${result.stdout}${result.stderr}`, '', label);
};
const message = (what, sha, phrase) => new RegExp(`^12-version-control\\.md: ${what} \\(commit ${sha.slice(0, 7)}\\).*CI.* ${phrase}.*(?:wait|explicit authorization)`);

for (const client of ['claude', 'codex']) {
  test(`${client}: a tag push or a release is asked about or blocked while the CI is pending, failed, missing, or unverified`, (t) => {
    const repo = project(t);
    for (const [state, [config, phrase]] of Object.entries(STATES)) {
      const gh = fakeGh(t, config);
      assertAsked(client, fire(client, repo, gh, 'git push origin v1'), message('this git push publishes tag v1', repo.first, phrase));
      assertAsked(client, fire(client, repo, gh, 'gh release create v1 --title 1'), message('gh release create publishes release v1', repo.first, phrase));
      assert.equal(gh.calls().length >= 2, true, state);
    }
    assertAsked(client, fire(client, repo, fakeGh(t, STATES.pending[0]), 'git push --tags'), message('this git push publishes tags', repo.head, 'is still running'));
  });

  test(`${client}: a tag push or a release passes in silence when the CI passed or no workflow is active`, (t) => {
    const repo = project(t);
    for (const config of Object.values(GREEN)) {
      const gh = fakeGh(t, config);
      for (const command of ['git push origin v1', 'git push --follow-tags', 'gh release create v1', 'gh release new v9']) assertSilent(fire(client, repo, gh, command), command);
    }
  });

  test(`${client}: a command without a tag push or a release passes in silence and never starts gh`, (t) => {
    const repo = project(t);
    const gh = fakeGh(t, STATES.pending[0]);
    for (const command of ['git push', 'git push origin main', 'git push origin :v1', 'git push origin --delete v1', 'git push -d origin v1', 'git status',
      'gh release list', 'gh pr create', "git commit -m 'git push --tags'", 'gh release create']) assertSilent(fire(client, repo, gh, command), command);
    assertSilent(runClientHook(client, hookFor(client, 'PreToolUse', 'check-release-ci.mjs'), repo, { input: {} }), 'no input');
    assert.deepEqual(gh.calls(), []);
  });

  test(`${client}: another repository than the maintained template is left alone even with a pending CI`, (t) => {
    const repo = makeRepo(t);
    repo.write('a.txt', 'a\n');
    repo.git('add', '-A');
    repo.git('commit', '-q', '-m', 'start');
    repo.git('tag', 'v1');
    const gh = fakeGh(t, STATES.pending[0]);
    for (const command of ['git push origin v1', 'git push --tags', 'gh release create v1']) assertSilent(fire(client, repo, gh, command), command);
    assert.deepEqual(gh.calls(), []);
  });

  test(`${client}: the hook reads an argument list and PowerShell quoting, and checks the commit of the tag, not HEAD`, (t) => {
    const repo = project(t);
    const gh = fakeGh(t, STATES.failed[0]);
    assertAsked(client, fire(client, repo, gh, ['git', 'push', 'origin', 'refs/tags/v1']), message('this git push publishes tag v1', repo.first, 'failed'));
    assertAsked(client, fire(client, repo, gh, 'git push origin refs/tags/v1', { tool_name: 'PowerShell' }), message('this git push publishes tag v1', repo.first, 'failed'));
    assertSilent(fire(client, repo, gh, 'git commit -m @\'\ngit push --tags\n\'@', { tool_name: 'PowerShell' }), 'here-string');
    const commits = [];
    const asked = (command, sha) => {
      const before = gh.calls().length;
      assertAsked(client, fire(client, repo, gh, command), new RegExp(`\\(commit ${sha.slice(0, 7)}\\)`));
      commits.push(gh.calls()[before][3]);
    };
    asked('git push origin v1', repo.first);
    asked('git push --tags', repo.head);
    asked(`gh release create v9 --target ${repo.first}`, repo.first);
    asked('gh release new v9', repo.head);
    assert.deepEqual(commits, [repo.first, repo.head, repo.first, repo.head]);
  });
}

test('the hook leaves a command too nested to read to the destructive-push hook', (t) => {
  const gh = fakeGh(t, STATES.pending[0]);
  const input = JSON.stringify({ tool_input: { command: `${'echo "$('.repeat(4000)}x${')"'.repeat(4000)}` } });
  for (const args of [['--hook'], ['--hook', '--deny']]) assertSilent(withEnv(gh.vars, () => run(process.execPath, [SCRIPT, ...args], { input })), `${args}`);
  assert.deepEqual(gh.calls(), []);
});

test('claude: the hook matches the three shell tools and runs without --deny; codex adds --deny, and --powershell on Windows', () => {
  const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'));
  const group = settings.hooks.PreToolUse.find((candidate) => JSON.stringify(candidate).includes('check-release-ci.mjs'));
  assert.deepEqual(group.matcher.split('|').sort(), ['Bash', 'Monitor', 'PowerShell']);
  assert.deepEqual(group.hooks.find((hook) => hook.args[0].endsWith('check-release-ci.mjs')).args.slice(1), ['--hook']);
  const hook = hookFor('codex', 'PreToolUse', 'check-release-ci.mjs');
  assert.match(hook.command, /--hook --deny$/);
  assert.match(hook.commandWindows, /-- --hook --deny --powershell$/);
});
