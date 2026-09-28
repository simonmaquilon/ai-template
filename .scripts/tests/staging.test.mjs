import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, WINDOWS, hookFor, makeRepo, run, runClientHook } from './support.mjs';

const BLOCKED = [
  'git add -A', 'git add .', 'git add -u', 'git add --all', 'git commit -a -m wip', 'git commit -am wip', 'cd docs && git add .',
  'git -C docs add -A', 'git -C "my docs" add .', 'git -c core.autocrlf=false commit -am wip', 'git --no-pager add --all',
  'git add ./', 'git add :/', 'git add *', 'git stage -A', 'git add -Av', 'git commit -qam wip', 'git add -A;git status',
  '(git add -A)', 'git commit -m "wip" -a', "cat <<'EOF'\nnote\nEOF\ngit add -A", "cat > f <<'EOF' && git add -A\nnote\nEOF",
  'git add "."', "git add '*'", 'git add ..', 'git add -A>/dev/null', 'bash -lc "git add -A"', "sh -c 'git add .'",
  'bash --norc -c "git add -A"', 'bash -o pipefail -c "git add ."', 'sh -c -- "git add -A"', "bash <<'EOF'\ngit add -A\nEOF",
  'eval "git add -A"', 'git commit -am"wip"', 'git commit -amwip2', 'git commit -m x .', 'git add .\\', 'sudo git add -A',
  'if ! git diff --quiet; then git add -A && git commit -m wip; fi', 'git diff --quiet || { git add -A; }',
  'for f in a; do git add .; done', '! git add -A', "# don't sweep anything\ngit add -A", 'git --git-dir .git add -A',
  'sudo -u root git add -A', 'env -i git add -A', 'grep x <<< foo\ngit add -A', 'git add ./*',
  'git diff --name-only | xargs git add', 'git add $(git diff --name-only)', "git add -- ':!package-lock.json'", 'git add',
  'git commit -m "msg $(git add -A)"', 'yes | git add -p', 'printf y | git add -i',
  'git add -p < answers.txt', "xargs -d '\\n' git add", 'xargs -n 1 git add', 'xargs -I{} git add {}',
  'git diff --name-only | git add --pathspec-from-file=-', 'git add -p <<< "y"', 'yes |& git add -p', 'yes | (git add -p)',
  'G=git; $G add -A', 'export G=git; ${G} add .', 'cat > n.md <<\\EOF\nhi\nEOF\ngit add -A',
];
// Blocked where a POSIX shell may run the command; PowerShell alone reads the backquote as an escape.
const POSIX_BLOCKED = ['git commit -m "Fix `git add -A` handling"'];
const ALLOWED = [
  'git add README.md', 'git add -- .scripts/check-staging.mjs', 'git commit -m "explicit"', 'git status',
  'git -C docs add README.md', 'git -C docs commit -m "explicit"',
  'git add ./src/app.ts', 'git add .gitignore', 'git add :/src/app.ts', 'git commit -m "fix -a flag"',
  "git commit -m 'explain git add -A and git add .'", 'git commit -m all',
  "git commit -F - <<'EOF'\nreject git add -A and git stage, the ./ and * pathspecs\nEOF",
  'git commit -uall -m wip', 'git commit -Sabc -m wip', 'git commit -m "."', 'git add ../shared/app.ts', 'bash -lc "git add src/app.ts"',
  `git commit -m "fix: block sh -c 'git add -A'"`, `echo "sh -c 'git add -A'"`, 'git add README.md\ngrep -c "." README.md',
  'git add src\\app.ts', 'git commit -m "msg" -- src/app.ts', 'git add -- ./docs/a.md',
  `git commit -m "$(cat <<'EOF'\nfix: reject "git commit -a -m wip" in the guard\nEOF\n)"`, 'git add src/a.ts  # not -A',
  "cat <<'MSG-END'\ngit add -A\nMSG-END", 'git stash -u', 'git commit --amend --no-edit', 'git add .github/workflows/x.yml',
  'git add -n .', 'git add --dry-run -A', 'git add --pathspec-from-file=paths.txt', "git add -- src ':!src/gen'",
  'git add -p', 'git add -i', 'git add -e', 'git add --patch', 'git add --interactive', 'git add --edit',
  `git commit -m "$(cat <<'EOF'\nfix (guard): reject "x" and \`y\`\nEOF\n)"`, 'git commit -m "Use `code` here"', 'git add src/a.ts > log.txt', 'G=x; echo $G', 'cat > n.md <<\\EOF\nhi\nEOF\ngit add n.md',
];
const POWERSHELL = [
  ['cd "C:\\repo\\"; git add -A', 2], ['& "C:\\Program Files\\Git\\cmd\\git.exe" add -A', 2], ['git add .\\*', 2],
  ["git commit -m @'\ndon't stage all\n'@; git status", 0], ["git commit -m @'\nx\n'@; git add -A", 2],
  ['git commit -m "Document `"git add .`" usage" -- README.md', 0], ['git commit `\n  -am "x"', 2], ['git commit `\r\n  -am "x"', 2], ['git add @(git diff --name-only)', 2], ["$g = 'git'; & $g add -A", 2], ["$G = 'git'; & $g add -A", 2], ['$null = git add -A', 2], ['$out = git commit -am x', 2], ['$null = git add src/a.ts', 0],
  [`git add -- @(${Array.from({ length: 150 }, (_, i) => `'src/components/card-${i}.vue'`).join(',')})`, 0], ["git add @('src/a.ts','src/b.ts')", 0], ['git commit -m "msg $(git add -A)"', 2],
];

for (const client of ['claude', 'codex']) {
  test(`${client}: the staging guard rejects bulk staging and allows explicit paths`, (t) => {
    const repo = makeRepo(t);
    const hook = hookFor(client, 'PreToolUse', 'check-staging.mjs');
    for (const command of [...BLOCKED, ...POSIX_BLOCKED]) {
      const result = runClientHook(client, hook, repo, { input: { tool_input: { command } } });
      assert.equal(result.status, 2, `${command}: ${result.stderr}`);
      assert.match(result.stderr, /27-version-control\.md/);
    }
    for (const command of ALLOWED) {
      const result = runClientHook(client, hook, repo, { input: { tool_input: { command } } });
      assert.equal(result.status, 0, `${command}: ${result.stderr}`);
    }
  });

  test(`${client}: the staging guard reads an argument list and runs from a subdirectory`, (t) => {
    const repo = makeRepo(t);
    mkdirSync(join(repo.dir, 'docs'));
    const hook = hookFor(client, 'PreToolUse', 'check-staging.mjs');
    const input = { tool_input: { command: ['git', 'add', '-A'] } };
    assert.equal(runClientHook(client, hook, repo, { cwd: join(repo.dir, 'docs'), input }).status, 2);
    const quoted = { tool_input: { command: ['bash', '-lc', `git commit -m "block sh -c 'git add .'"`] } };
    assert.equal(runClientHook(client, hook, repo, { input: quoted }).status, 0);
    assert.equal(runClientHook(client, hook, repo, { input: {} }).status, 0);
    assert.equal(run(process.execPath, [join(ROOT, '.scripts', 'check-staging.mjs'), '--hook'], { input: 'null' }).status, 0);
    const nested = { tool_input: { command: `${'echo "$('.repeat(4000)}x${')"'.repeat(4000)}` } };
    assert.equal(run(process.execPath, [join(ROOT, '.scripts', 'check-staging.mjs'), '--hook'], { input: JSON.stringify(nested) }).status, 2);
  });

  test(`${client}: the staging guard reads PowerShell quoting when the client names that tool`, (t) => {
    const repo = makeRepo(t);
    const hook = hookFor(client, 'PreToolUse', 'check-staging.mjs');
    for (const [command, status] of POWERSHELL) {
      const result = runClientHook(client, hook, repo, { input: { tool_name: 'PowerShell', tool_input: { command } } });
      assert.equal(result.status, status, `${command}: ${result.stderr}`);
    }
    const redirected = { tool_name: 'PowerShell', tool_input: { command: 'git add src/a.ts *> $null' } };
    assert.equal(runClientHook(client, hook, repo, { input: redirected }).status, 0);
  });
}

test('claude: the staging guard matches both of its shell tools', () => {
  const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'));
  const group = settings.hooks.PreToolUse.find((candidate) => JSON.stringify(candidate).includes('check-staging.mjs'));
  assert.deepEqual(group.matcher.split('|').sort(), ['Bash', 'PowerShell']);
});

test('codex: on Windows the staging guard reads the Bash tool command both as PowerShell and as POSIX', (t) => {
  const repo = makeRepo(t);
  const hook = hookFor('codex', 'PreToolUse', 'check-staging.mjs');
  assert.match(hook.commandWindows, /--powershell/);
  assert.doesNotMatch(hook.command, /--powershell/);
  for (const [command, status] of [...POWERSHELL, ...POSIX_BLOCKED.map((command) => [command, 2])]) {
    const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
    assert.equal(run(process.execPath, [join(ROOT, '.scripts', 'check-staging.mjs'), '--hook', '--powershell'], { input }).status, status, command);
    if (WINDOWS) assert.equal(runClientHook('codex', hook, repo, { input: JSON.parse(input) }).status, status, command);
  }
});
