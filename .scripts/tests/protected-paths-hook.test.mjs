import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, hookFor } from './support.mjs';
import { before, project, reason, silent } from './protected-paths-fixture.mjs';

const MESSAGE = (path) => new RegExp(`^AGENTS\\.md: this command writes ${JSON.stringify(path).replaceAll('.', '\\.')}, which the project protects `
  + '\\(permissions\\.deny or sandbox\\.filesystem\\.denyWrite in \\.claude/settings\\.json or \\.claude/settings\\.local\\.json\\); changing it needs the user\'s explicit authorization\\.$');
const DENIED = [['echo x > .agents/tool-versions.json', '.agents/tool-versions.json'], ['rm -rf .scripts/old', '.scripts'], ['sed -i s/a/b/ .codex/hooks.json', '.codex'],
  ['git checkout -- config', 'config'], ['cat a | tee docs/b.md', 'docs'], ['cd docs && mv a.md b.md', 'docs'], ['bash -c "rm docs/a.md"', 'docs'],
  ['cp x config/a.json && echo done', 'config'], ['truncate -s 0 .scripts/a.mjs', '.scripts'], ['git restore docs/a.md', 'docs']];
// The legitimate commands of the template write protected paths with the user's approval, and none names one as a shell write.
const SILENT = ['cat .scripts/a.mjs', 'node .scripts/tool-versions.mjs --add appium-mcp --repository https://example.invalid/x',
  'node .scripts/template-manifest.mjs --write', 'node .scripts/run-checks.mjs', 'git add .scripts/a.mjs docs/a.md', 'git commit -m "docs: change docs/a.md"',
  'grep -rn x .scripts docs', 'echo x > sub/.scripts/y', 'cd sub && rm .scripts/x.mjs', 'echo x > src/a.ts', 'echo "> docs/a.md"', 'git restore --staged docs/a.md', ''];

for (const client of ['claude', 'codex']) {
  test(`${client}: the protected-paths hook asks, or rejects where it cannot ask, for each shell write into a protected path`, (t) => {
    const repo = project(t);
    for (const [command, path] of DENIED) assert.match(reason(client, before(client, repo, command), command), MESSAGE(path), command);
  });

  test(`${client}: the protected-paths hook stays silent for reads, for the template's own commands, and for a name that is not from the root`, (t) => {
    const repo = project(t);
    for (const command of SILENT) silent(before(client, repo, command), command);
    silent(before(client, repo, 'rm .scripts/x.mjs', { cwd: join(repo.dir, 'sub') }), 'from sub');
    assert.match(reason(client, before(client, repo, 'rm ../docs/a.md', { cwd: join(repo.dir, 'sub') }), 'up'), MESSAGE('docs'));
    for (const input of [{}, { tool_input: {} }]) silent(before(client, repo, undefined, input), JSON.stringify(input));
  });

  test(`${client}: the protected-paths hook follows the list of .claude/settings.json: none, an unreadable one, and a changed one`, (t) => {
    const repo = project(t, null);
    silent(before(client, repo, 'rm .scripts/a.mjs'), 'no settings file');
    repo.write('.claude/settings.json', JSON.stringify({ permissions: { deny: ['Bash(sudo *)'] } }));
    silent(before(client, repo, 'rm .scripts/a.mjs'), 'no rules');
    repo.write('.claude/settings.json', JSON.stringify({ sandbox: { filesystem: { denyWrite: ['src'] } } }));
    silent(before(client, repo, 'rm .scripts/a.mjs'), 'other rules');
    assert.match(reason(client, before(client, repo, 'echo x > src/a.ts'), 'src'), MESSAGE('src'));
    repo.write('.claude/settings.json', '{ not json');
    assert.match(reason(client, before(client, repo, 'git status'), 'invalid'), /^AGENTS\.md: the protected-paths guard could not read this command or the list in \.claude\/settings\.json;/);
  });
}

// Codex starts the hooks of the repository the session is in, which have no such script there and end quietly.
test('claude: the protected-paths hook leaves alone a command that starts in another repository, unless it may reach this one', (t) => {
  const repo = project(t);
  assert.equal(repo.git('init', '-q', 'nested').status, 0);
  silent(before('claude', repo, 'rm ../docs/a.md', { cwd: join(repo.dir, 'nested') }), 'nested');
  assert.match(reason('claude', before('claude', repo, 'cd .. && rm docs/a.md', { cwd: join(repo.dir, 'nested') }), 'leaves'), MESSAGE('docs'));
});

test('claude: the PowerShell tool is read as PowerShell, and a command nested too deep to read asks', (t) => {
  const repo = project(t);
  for (const [command, path] of [['Set-Content .scripts\\a.mjs hi', '.scripts'], ['Remove-Item -Recurse docs', 'docs'], ['"x" | Out-File config\\a.json', 'config']]) {
    assert.match(reason('claude', before('claude', repo, command, { tool_name: 'PowerShell' }), command), MESSAGE(path), command);
  }
  silent(before('claude', repo, 'Get-Content .scripts\\a.mjs', { tool_name: 'PowerShell' }), 'read');
  let nested = 'rm docs/a.md';
  for (let i = 0; i < 10; i++) nested = `eval ${JSON.stringify(nested)}`;
  assert.match(reason('claude', before('claude', repo, nested), 'deep'), /could not read this command/);
});

test('the protected-paths hook is registered before and after shell commands in both clients, and rejects in Codex', () => {
  const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'));
  const group = (event) => settings.hooks[event].find((candidate) => JSON.stringify(candidate).includes('check-protected-paths.mjs'));
  assert.equal(group('PreToolUse').matcher, 'Bash|PowerShell|Monitor');
  assert.equal(group('PostToolUse').matcher, 'Bash|PowerShell|Monitor');
  assert.deepEqual(group('PostToolUse').hooks[0].args.slice(1), ['--after']);
  assert.equal(group('PostToolUseFailure').matcher, 'Bash|PowerShell|Monitor');
  assert.deepEqual(group('PostToolUseFailure').hooks[0].args.slice(1), ['--after']);
  const pre = hookFor('codex', 'PreToolUse', 'check-protected-paths.mjs');
  assert.match(pre.command, /--deny$/);
  assert.match(pre.commandWindows, /-- --deny --powershell$/);
  assert.match(hookFor('codex', 'PostToolUse', 'check-protected-paths.mjs').commandWindows, /-- --after$/);
});

test('the protected-paths hook guards the paths the template\'s own settings declare, and lets its documented commands through', (t) => {
  const repo = project(t, null);
  repo.write('.claude/settings.json', readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'));
  for (const command of ['echo x > .scripts/a.mjs', 'rm .agents/tool-versions.json', 'git checkout -- .codex', 'rm -rf .temp/playwright-cli']) {
    assert.match(reason('claude', before('claude', repo, command), command), /AGENTS\.md: this command writes/, command);
  }
  for (const command of ['node .scripts/tool-versions.mjs --add x', 'git add .scripts/a.mjs', 'cat .codex/hooks.json']) silent(before('claude', repo, command), command);
});
