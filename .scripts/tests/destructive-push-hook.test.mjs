import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, hookFor, makeRepo, run, runClientHook } from './support.mjs';

const SCRIPT = join(ROOT, '.scripts', 'check-destructive-push.mjs');
const message = (reason) => `AGENTS.md: this git push ${reason}, which overwrites or deletes remote refs; it needs the user's explicit authorization.`;
const fire = (client, repo, command, extra = {}) => {
  const hook = hookFor(client, 'PreToolUse', 'check-destructive-push.mjs');
  return runClientHook(client, hook, repo, { input: { cwd: repo.dir, tool_input: { command }, ...extra } });
};

// Claude Code is asked to confirm and runs the command if the user agrees; Codex has no "ask" and would run it
// whatever the hook prints, so its hook rejects the command with exit status 2.
function assertAsked(client, result, reason) {
  if (client === 'claude') {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), {
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: message(reason) },
    });
  } else {
    assert.equal(result.status, 2, result.stdout);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim(), message(reason));
  }
}
const assertSilent = (result, command) => {
  assert.equal(result.status, 0, `${command}: ${result.stderr}`);
  assert.equal(`${result.stdout}${result.stderr}`, '', command);
};

for (const client of ['claude', 'codex']) {
  test(`${client}: the destructive-push guard asks or blocks, citing its rule, for each way a push overwrites or deletes`, (t) => {
    const repo = makeRepo(t);
    repo.git('remote', 'add', 'bk', 'https://example.invalid/a.git');
    repo.git('config', 'remote.bk.mirror', 'true');
    repo.git('config', 'alias.pf', 'push --force');
    const cases = [
      ['git push --force', 'uses --force'], ['git push -uf origin main', 'uses -uf'], ['git push --de origin old', 'uses --de'],
      ['git push origin "+main"', 'forces main with +main'], ["git push origin ':old'", 'deletes old with :old'],
      ['git -c remote.bk.mirror=true push bk', 'sets remote.bk.mirror inline'], ['git --config-env=remote.bk.push=P push bk', 'sets remote.bk.push inline'],
      ['GIT_CONFIG_COUNT=1 git push', 'sets git configuration inline'], ['git push bk', 'pushes to remote bk, configured as a mirror'],
      ['git pf', 'uses --force'], ["sh -c 'git push --force'", 'uses --force'],
    ];
    for (const [command, reason] of cases) assertAsked(client, fire(client, repo, command), reason);
  });

  test(`${client}: the destructive-push guard stays silent for plain pushes and commands without a push`, (t) => {
    const repo = makeRepo(t);
    for (const command of ['git push', 'git push origin main', 'git push -u origin feature', 'git push origin v1', 'git push --tags',
      'git push --follow-tags', 'git push --dry-run', 'git push origin HEAD:main', 'git push -o ci.skip origin main', 'git status',
      "git commit -m 'git push --force'"]) assertSilent(fire(client, repo, command), command);
    assertSilent(runClientHook(client, hookFor(client, 'PreToolUse', 'check-destructive-push.mjs'), repo, { input: {} }), 'no input');
  });

  test(`${client}: the destructive-push guard reads an argument list and PowerShell quoting`, (t) => {
    const repo = makeRepo(t);
    assertAsked(client, fire(client, repo, ['git', 'push', '-uf', 'origin', 'main']), 'uses -uf');
    assertAsked(client, fire(client, repo, 'git push origin +main', { tool_name: 'PowerShell' }), 'forces main with +main');
    assertAsked(client, fire(client, repo, ['bash', '-lc', 'git push --delete origin old']), 'uses --delete');
    assertSilent(fire(client, repo, 'git commit -m @\'\ngit push --force\n\'@', { tool_name: 'PowerShell' }), 'here-string');
  });
}

test('codex: on Windows the destructive-push guard reads the Bash tool command both as PowerShell and as POSIX', () => {
  const hook = hookFor('codex', 'PreToolUse', 'check-destructive-push.mjs');
  assert.match(hook.commandWindows, /--hook --deny --powershell/);
  assert.match(hook.command, /--hook --deny(?! --powershell)/);
  for (const [command, status] of [['git push -uf origin main', 2], ['git push origin main', 0], ['git commit -m "git push --force"', 0]]) {
    const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
    assert.equal(run(process.execPath, [SCRIPT, '--hook', '--deny', '--powershell'], { input }).status, status, command);
  }
});

test('claude: the destructive-push guard matches both of its shell tools and runs without --deny', () => {
  const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'));
  const group = settings.hooks.PreToolUse.find((candidate) => JSON.stringify(candidate).includes('check-destructive-push.mjs'));
  assert.deepEqual(group.matcher.split('|').sort(), ['Bash', 'PowerShell']);
  assert.deepEqual(group.hooks[0].args.slice(1), ['--hook']);
});

test('the destructive-push guard says so when it cannot read a command, and stays out of a nested repository', (t) => {
  const repo = makeRepo(t);
  const input = { tool_input: { command: `${'echo "$('.repeat(4000)}x${')"'.repeat(4000)}` } };
  const unread = run(process.execPath, [SCRIPT, '--hook', '--deny'], { input: JSON.stringify(input) });
  assert.equal(unread.status, 2);
  assert.match(unread.stderr, /AGENTS\.md: .*could not read this command/);
  const asked = run(process.execPath, [SCRIPT, '--hook'], { input: JSON.stringify(input) });
  assert.equal(asked.status, 0);
  assert.equal(JSON.parse(asked.stdout).hookSpecificOutput.permissionDecision, 'ask');
  repo.git('init', '-q', 'nested');
  const nested = join(repo.dir, 'nested');
  for (const args of [['--hook'], ['--hook', '--deny']]) {
    const command = (text) => JSON.stringify({ cwd: nested, tool_input: { command: text } });
    const beside = (text) => run(process.execPath, [join(repo.dir, '.scripts', 'check-destructive-push.mjs'), ...args], { input: command(text), cwd: nested });
    assertSilent(beside('git push --force'), `nested ${args}`);
    assertSilent(beside(input.tool_input.command), `nested unreadable ${args}`);
    const reaching = beside(`git -C ${repo.dir} push --force`);
    assert.notEqual(`${reaching.stdout}${reaching.stderr}`, '', `may reach the project ${args}`);
  }
});
