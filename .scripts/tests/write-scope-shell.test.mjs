import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { toPosix } from '../hook-support.mjs';
import { commands } from '../shell-commands.mjs';
import { fromGitBash } from '../write-scope-shell.mjs';
import { WINDOWS } from './support.mjs';
import { assertDenied, assertSilent, scope } from './write-scope-fixture.mjs';

const MATCHERS = { claude: 'Bash|PowerShell', codex: 'Bash' };
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
// A path as a POSIX shell takes it on Windows too, where a backslash would escape, and as Git Bash spells its drive.
const inBash = (...parts) => toPosix(join(...parts));
const gitBash = (path) => `/${path[0].toLowerCase()}${toPosix(path.slice(2))}`;

test('the shell reader returns output redirection targets apart from words', () => {
  assert.deepEqual(commands('echo hi > a.txt 2>/dev/null < in.txt').map(({ targets }) => targets), [['a.txt', '/dev/null']]);
  assert.deepEqual(commands('echo hi > a.txt').map(({ words }) => words), [['echo', 'hi']]);
  assert.deepEqual(commands('make &> "$TMPDIR/log"').map(({ targets }) => targets), [['$TMPDIR/log']]);
  assert.deepEqual(commands('cat <<<"x" | tee b.txt').map(({ targets }) => targets), [[], []]);
});

test('a word of a Git Bash command is read as the Windows path its /tmp and drive mounts lead to', () => {
  const temp = 'C:\\Users\\me\\AppData\\Local\\Temp';
  assert.equal(fromGitBash('/tmp', temp), temp);
  assert.equal(fromGitBash('/tmp/a/x.txt', temp), `${temp}/a/x.txt`);
  assert.equal(fromGitBash('/c/Users/me/x.txt', temp), 'c:/Users/me/x.txt');
  assert.equal(fromGitBash('/D', temp), 'D:/');
  for (const word of ['/tmpx/a', '/usr/bin/env', 'notes/tmp/x', 'C:/x.txt', '.temp/x.txt', '']) assert.equal(fromGitBash(word, temp), word);
});

for (const client of ['claude', 'codex']) {
  test(`${client}: evident shell writes into a temporary folder are denied with a reason that names .temp/`, (t) => {
    const { tmp, fire } = scope(t);
    const denied = ['echo hi > "$TMPDIR/x.txt"', 'echo hi >> ${TMPDIR}/x.txt', `printf x > ${inBash(tmp, 'x.txt')}`,
      'cat <<EOF > $TMP/notes.md\nbody\nEOF', `make 2>&1 | tee -a ${inBash(tmp, 'log.txt')}`, 'd=$(mktemp -d)', 'mktemp',
      'mktemp -t probe', 'mktemp -p "$TMPDIR" x.XXXX', 'mktemp --tmpdir x.XXXX', 'make &> $TEMP/build.log'];
    if (!WINDOWS) denied.push('echo hi > /tmp/write-scope-probe.txt', 'mktemp /var/tmp/x.XXXX');
    // Claude Code runs Bash commands in Git Bash on Windows, which mounts the temporary folder at /tmp and each drive.
    if (WINDOWS && client === 'claude') {
      denied.push('echo hi > /tmp/write-scope-probe.txt', 'mktemp /tmp/x.XXXX', `printf x > ${gitBash(tmp)}/x.txt`);
    }
    for (const command of denied) assertDenied(fire(client, MATCHERS[client], bash(command)), command);
  });

  test(`${client}: other shell commands get no opinion from the write-scope hook`, (t) => {
    const { outside, fire } = scope(t);
    for (const command of ['echo hi > .temp/x.txt', 'node a.mjs 2>/dev/null', 'ls /tmp', 'cat "$TMPDIR/x.txt"',
      "echo '> /tmp/x'", 'mktemp .temp/x.XXXX', 'mktemp -d -p .temp', 'TMPDIR=.temp mktemp', `echo hi > ${inBash(outside, 'x')}`,
      'git status', 'tee .temp/out.txt']) {
      assertSilent(fire(client, MATCHERS[client], bash(command)), command);
    }
    assertSilent(fire(client, MATCHERS[client], { tool_name: 'Bash', tool_input: {} }), 'no command');
    if (WINDOWS && client === 'codex') assertSilent(fire(client, MATCHERS[client], bash('echo hi > /tmp/x.txt')), 'no Git Bash');
  });
}

test('claude: PowerShell redirections and Tee-Object into a temporary folder are denied', (t) => {
  const { fire } = scope(t);
  const ps = (command) => ({ tool_name: 'PowerShell', tool_input: { command } });
  for (const command of ['Get-Date > $env:TEMP\\x.txt', 'Get-Date | Tee-Object -FilePath $env:TMP\\x.txt', 'New-TemporaryFile']) {
    assertDenied(fire('claude', MATCHERS.claude, ps(command)), command);
  }
  assertSilent(fire('claude', MATCHERS.claude, ps('Get-Date > .temp\\x.txt')), 'inside');
  if (WINDOWS) assertSilent(fire('claude', MATCHERS.claude, ps('Get-Date > /tmp/x.txt')), 'PowerShell mounts no /tmp');
});
