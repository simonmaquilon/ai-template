import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, hookFor, makeRepo, runClientHook } from './support.mjs';

const BLOCKED = [
  'git add -A', 'git add .', 'git add -u', 'git add --all', 'git commit -a -m wip', 'git commit -am wip', 'cd docs && git add .',
  'git -C docs add -A', 'git -C "my docs" add .', 'git -c core.autocrlf=false commit -am wip', 'git --no-pager add --all',
  'git add ./', 'git add :/', 'git add *', 'git stage -A', 'git add -Av', 'git commit -qam wip', 'git add -A;git status',
  '(git add -A)', 'git commit -m "wip" -a', "cat <<'EOF'\nnote\nEOF\ngit add -A", "cat > f <<'EOF' && git add -A\nnote\nEOF",
  'git add "."', "git add '*'", 'git add ..', 'git add -A>/dev/null', 'bash -lc "git add -A"', "sh -c 'git add .'",
  'bash --norc -c "git add -A"', 'bash -o pipefail -c "git add ."', 'sh -c -- "git add -A"', "bash <<'EOF'\ngit add -A\nEOF",
  'eval "git add -A"', 'git commit -am"wip"', 'git commit -amwip2', 'git commit -m x .', 'git add .\\', 'sudo git add -A',
];
const ALLOWED = [
  'git add README.md', 'git add -- .scripts/check-staging.mjs', 'git commit -m "explicit"', 'git status',
  'git -C docs add README.md', 'git -C docs commit -m "explicit"',
  'git add ./src/app.ts', 'git add .gitignore', 'git add :/src/app.ts', 'git commit -m "fix -a flag"',
  "git commit -m 'explain git add -A and git add .'", 'git commit -m all',
  "git commit -F - <<'EOF'\nreject git add -A and git stage, the ./ and * pathspecs\nEOF",
  'git commit -uall -m wip', 'git commit -Sabc -m wip', 'git commit -m "."', 'git add ../shared/app.ts', 'bash -lc "git add src/app.ts"',
  `git commit -m "fix: block sh -c 'git add -A'"`, `echo "sh -c 'git add -A'"`, 'git add README.md\ngrep -c "." README.md',
  'git add src\\app.ts', 'git commit -m "msg" -- src/app.ts', 'git add -- ./docs/a.md',
];

for (const client of ['claude', 'codex']) {
  test(`${client}: the staging guard rejects bulk staging and allows explicit paths`, (t) => {
    const repo = makeRepo(t);
    const hook = hookFor(client, 'PreToolUse', 'check-staging.mjs');
    for (const command of BLOCKED) {
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
  });
}

test('claude: the staging guard matches both of its shell tools', () => {
  const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'));
  const group = settings.hooks.PreToolUse.find((candidate) => JSON.stringify(candidate).includes('check-staging.mjs'));
  assert.deepEqual(group.matcher.split('|').sort(), ['Bash', 'PowerShell']);
});
