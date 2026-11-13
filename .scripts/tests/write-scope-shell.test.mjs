import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { commands } from '../shell-commands.mjs';
import { WINDOWS } from './support.mjs';
import { assertDenied, assertSilent, scope } from './write-scope-fixture.mjs';

const MATCHERS = { claude: 'Bash|PowerShell', codex: 'Bash' };
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

test('the shell reader returns output redirection targets apart from words', () => {
  assert.deepEqual(commands('echo hi > a.txt 2>/dev/null < in.txt').map(({ targets }) => targets), [['a.txt', '/dev/null']]);
  assert.deepEqual(commands('echo hi > a.txt').map(({ words }) => words), [['echo', 'hi']]);
  assert.deepEqual(commands('make &> "$TMPDIR/log"').map(({ targets }) => targets), [['$TMPDIR/log']]);
  assert.deepEqual(commands('cat <<<"x" | tee b.txt').map(({ targets }) => targets), [[], []]);
});

for (const client of ['claude', 'codex']) {
  test(`${client}: evident shell writes into a temporary folder are denied with a reason that names .temp/`, (t) => {
    const { tmp, fire } = scope(t);
    const denied = ['echo hi > "$TMPDIR/x.txt"', 'echo hi >> ${TMPDIR}/x.txt', `printf x > ${join(tmp, 'x.txt')}`,
      'cat <<EOF > $TMP/notes.md\nbody\nEOF', `make 2>&1 | tee -a ${join(tmp, 'log.txt')}`, 'd=$(mktemp -d)', 'mktemp',
      'mktemp -t probe', 'mktemp -p "$TMPDIR" x.XXXX', 'mktemp --tmpdir x.XXXX', 'make &> $TEMP/build.log'];
    if (!WINDOWS) denied.push('echo hi > /tmp/write-scope-probe.txt', 'mktemp /var/tmp/x.XXXX');
    for (const command of denied) assertDenied(fire(client, MATCHERS[client], bash(command)), command);
  });

  test(`${client}: other shell commands get no opinion from the write-scope hook`, (t) => {
    const { outside, fire } = scope(t);
    for (const command of ['echo hi > .temp/x.txt', 'node a.mjs 2>/dev/null', 'ls /tmp', 'cat "$TMPDIR/x.txt"',
      "echo '> /tmp/x'", 'mktemp .temp/x.XXXX', 'mktemp -d -p .temp', 'TMPDIR=.temp mktemp', `echo hi > ${join(outside, 'x')}`,
      'git status', 'tee .temp/out.txt']) {
      assertSilent(fire(client, MATCHERS[client], bash(command)), command);
    }
    assertSilent(fire(client, MATCHERS[client], { tool_name: 'Bash', tool_input: {} }), 'no command');
  });
}

test('claude: PowerShell redirections and Tee-Object into a temporary folder are denied', (t) => {
  const { fire } = scope(t);
  const ps = (command) => ({ tool_name: 'PowerShell', tool_input: { command } });
  for (const command of ['Get-Date > $env:TEMP\\x.txt', 'Get-Date | Tee-Object -FilePath $env:TMP\\x.txt', 'New-TemporaryFile']) {
    assertDenied(fire('claude', MATCHERS.claude, ps(command)), command);
  }
  assertSilent(fire('claude', MATCHERS.claude, ps('Get-Date > .temp\\x.txt')), 'inside');
});
