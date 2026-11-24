import assert from 'node:assert/strict';
import test from 'node:test';
import { scratch } from './scratch-fixture.mjs';

const EXEMPT = ['node .scripts/run-checks.mjs *', 'pnpm run test:e2e*'];
const SANDBOX = { sandbox: { enabled: true, excludedCommands: EXEMPT } };
const hookScratch = (t) => scratch(t, ['check-exempt-command.mjs', 'exempt-command.mjs', 'exempt-match.mjs', 'exempt-shapes.mjs', 'shell-spans.mjs', 'hook-support.mjs']);

// A scratch folder with the given settings files and a function that fires the hook on a command.
function setup(t, { shared = SANDBOX, local } = {}) {
  const repo = hookScratch(t);
  if (shared !== undefined) repo.write('.claude/settings.json', typeof shared === 'string' ? shared : JSON.stringify(shared));
  if (local !== undefined) repo.write('.claude/settings.local.json', JSON.stringify(local));
  return (command, tool_name = 'Bash', extra = {}) => {
    const { status, stdout, stderr } = repo.script('check-exempt-command.mjs', [], JSON.stringify({ cwd: repo.dir, tool_name, tool_input: { command, ...extra } }));
    return { status, stdout, stderr };
  };
}

const silent = (result, label) => assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', ''], label);

test('the exact exempt form passes, with or without arguments, and a lone 2>&1 does not break it', (t) => {
  const fire = setup(t);
  for (const command of ['node .scripts/run-checks.mjs', 'node .scripts/run-checks.mjs --only a.test.mjs', 'node .scripts/run-checks.mjs 2>&1',
    'pnpm run test:e2e', 'pnpm run test:e2e:smoke -- --grep "a > b"']) silent(fire(command), command);
});

test('a form that confines an exempt command is denied with the rule, the exact form and where to read the output', (t) => {
  const fire = setup(t);
  const cases = {
    'node .scripts/run-checks.mjs > .temp/out.log': 'node .scripts/run-checks.mjs',
    'node .scripts/run-checks.mjs 2>&1 | tail -20': 'node .scripts/run-checks.mjs 2>&1',
    'node .scripts/run-checks.mjs && echo done': 'node .scripts/run-checks.mjs',
    'node .scripts/run-checks.mjs; echo done': 'node .scripts/run-checks.mjs',
    'node .scripts/run-checks.mjs || exit 1': 'node .scripts/run-checks.mjs',
    'FOO=1 node .scripts/run-checks.mjs': 'node .scripts/run-checks.mjs',
    'cd sub && node .scripts/run-checks.mjs --only x': 'node .scripts/run-checks.mjs --only x',
    'pushd . && pnpm run test:e2e': 'pnpm run test:e2e',
    'sudo node .scripts/run-checks.mjs': 'node .scripts/run-checks.mjs',
    'echo $(node .scripts/run-checks.mjs)': 'node .scripts/run-checks.mjs',
    '(node .scripts/run-checks.mjs)': 'node .scripts/run-checks.mjs',
    'node .scripts/run-checks.mjs >> .temp/out.log 2>&1': 'node .scripts/run-checks.mjs 2>&1',
  };
  for (const [command, form] of Object.entries(cases)) {
    const result = fire(command);
    assert.equal(result.status, 2, command);
    assert.match(result.stderr, /^16-command-execution\.md: /, command);
    assert.ok(result.stderr.includes(`\`${form}\``), `${command}: ${result.stderr}`);
    assert.match(result.stderr, /background task's output|log/, command);
  }
});

test('a pipe, a chain and a leading variable cite the repository rule, not a confinement the client documentation does not confirm', (t) => {
  const fire = setup(t);
  for (const command of ['node .scripts/run-checks.mjs | tail', 'node .scripts/run-checks.mjs && echo done', 'node .scripts/run-checks.mjs; echo done',
    'node .scripts/run-checks.mjs || exit 1', 'FOO=1 node .scripts/run-checks.mjs']) {
    const result = fire(command);
    assert.equal(result.status, 2, command);
    assert.match(result.stderr, /repository rule[^.]*never redirected, piped, chained, or prefixed/, command);
    assert.doesNotMatch(result.stderr, /confined|fails as it would/, command);
  }
  const mixed = fire('node .scripts/run-checks.mjs 2>/dev/null | tail');
  assert.match(mixed.stderr, /a redirection keeps this call confined/);
  assert.match(mixed.stderr, /a pipe breaks the repository rule/);
});

test('a Monitor or PowerShell call is judged as a Bash one', (t) => {
  const fire = setup(t);
  for (const tool of ['Monitor', 'PowerShell', 'Bash']) {
    assert.equal(fire('node .scripts/run-checks.mjs | tail', tool).status, 2, tool);
    silent(fire('node .scripts/run-checks.mjs', tool), tool);
  }
});

test('commands that are not exempt, or only mention an exempt one, pass whatever their form', (t) => {
  const fire = setup(t);
  for (const command of ['npm test > .temp/out.log', 'npm test 2>&1 | tail', 'cd sub && npm test', 'FOO=1 npm test', 'echo "node .scripts/run-checks.mjs > x"',
    "git commit -m 'node .scripts/run-checks.mjs | tail'", 'cat <<EOF\nnode .scripts/run-checks.mjs | tail\nEOF', 'node .scripts/run-checks.mjs.bak > x']) {
    silent(fire(command), command);
  }
});

test('a chain is denied even when every command in it is exempt', (t) => {
  const fire = setup(t);
  for (const command of ['node .scripts/run-checks.mjs && pnpm run test:e2e', 'node .scripts/run-checks.mjs & pnpm run test:e2e', 'node .scripts/run-checks.mjs\npnpm run test:e2e']) {
    const result = fire(command);
    assert.equal(result.status, 2, command);
    assert.match(result.stderr, /command chaining/, command);
  }
});

test('a call that disables the sandbox for itself is not confined, so it passes', (t) => {
  const fire = setup(t);
  silent(fire('node .scripts/run-checks.mjs | tail', 'Bash', { dangerouslyDisableSandbox: true }), 'true');
  assert.equal(fire('node .scripts/run-checks.mjs | tail', 'Bash', { dangerouslyDisableSandbox: false }).status, 2, 'false');
  assert.equal(fire('node .scripts/run-checks.mjs | tail', 'Bash', { dangerouslyDisableSandbox: 'true' }).status, 2, 'a string');
});

test('without an active sandbox or an exemption list the hook stays silent', (t) => {
  const command = 'node .scripts/run-checks.mjs > x';
  silent(setup(t, { shared: { sandbox: { enabled: false, excludedCommands: EXEMPT } } })(command), 'disabled');
  silent(setup(t, { shared: { sandbox: { excludedCommands: EXEMPT } } })(command), 'no enabled');
  silent(setup(t, { shared: { sandbox: { enabled: true } } })(command), 'no list');
  silent(setup(t, { shared: SANDBOX, local: { sandbox: { enabled: false } } })(command), 'local switches it off');
});

test('an exemption declared in settings.local.json counts, and the lists of both files are joined', (t) => {
  const fire = setup(t, { shared: { sandbox: { enabled: true } }, local: { sandbox: { excludedCommands: ['make e2e*'] } } });
  assert.equal(fire('make e2e > x').status, 2);
  const both = setup(t, { local: { sandbox: { excludedCommands: ['make e2e*'] } } });
  assert.equal(both('make e2e | tail').status, 2);
  assert.equal(both('pnpm run test:e2e | tail').status, 2);
});

test('unreadable input or settings never block', (t) => {
  const repo = hookScratch(t);
  const fire = (input) => repo.script('check-exempt-command.mjs', [], input);
  for (const input of ['', 'not json', '{}', JSON.stringify({ tool_name: 'Bash' }), JSON.stringify({ tool_name: 'Monitor', tool_input: { ws: { url: 'wss://x.invalid' } } })]) {
    assert.equal(fire(input).status, 0, input);
  }
  const command = JSON.stringify({ cwd: repo.dir, tool_name: 'Bash', tool_input: { command: 'node .scripts/run-checks.mjs > x' } });
  assert.equal(fire(command).status, 0, 'no settings');
  repo.write('.claude/settings.json', '{ broken');
  assert.equal(fire(command).status, 0, 'broken settings');
});
