import assert from 'node:assert/strict';
import test from 'node:test';
import { hookFor, makeRepo, runClientHook } from './support.mjs';

// Commands whose bulk staging sits in a git alias, a script file, or a make
// target, next to ones whose hidden commands name explicit paths.
const CASES = [
  ['git aa', 2], ['git -c alias.bb="add -A" bb', 2], ['git ss', 0], ['git status', 0],
  ['bash stage.sh', 2], ['sh ./stage.sh', 2], ['./stage.sh', 2], ['source stage.sh', 2], ['bash safe.sh', 0],
  ['make stage', 2], ['make', 0], ['make safe', 0], ['make -f other.mk sweep', 2], ['pwsh -File stage.ps1', 2],
  ['git ci -m "feat: mark required fields with *"', 0], ['git ci -m "fix: support the -a flag"', 0], ["git ci -m 'docs: stage with .'", 0],
  ['powershell -ExecutionPolicy Bypass -File stage.ps1', 2], ['bash -o pipefail stage.sh', 2], ['make -fother.mk sweep', 2],
  ['make -Csub nested', 2], ['make gated', 2], ['bash loop.sh', 0],
];

for (const client of ['claude', 'codex']) {
  test(`${client}: the staging guard checks what aliases, script files, and make targets run`, (t) => {
    const repo = makeRepo(t);
    repo.git('config', 'alias.aa', 'add -A');
    repo.git('config', 'alias.ss', 'status --short');
    repo.git('config', 'alias.ci', 'commit');
    repo.write('loop.sh', 'source loop.sh\ngit add src/a.ts\n');
    repo.write('sub/Makefile', 'nested:\n\tgit add .\n');
    repo.write('stage.sh', 'echo staging\ngit add -A\n');
    repo.write('safe.sh', 'git add src/a.ts\n');
    repo.write('stage.ps1', 'Write-Output staging\ngit add .\n');
    repo.write('Makefile', 'check:\n\t@echo ok\nstage: check\n\tgit add -A\nsafe:\n\tgit add src/a.ts\ngated:\nifeq ($(CI),)\n\tgit add -A\nendif\n');
    repo.write('other.mk', 'sweep:\n\t-git add --all\n');
    const hook = hookFor(client, 'PreToolUse', 'check-staging.mjs');
    for (const [command, status] of CASES) {
      const result = runClientHook(client, hook, repo, { input: { cwd: repo.dir, tool_input: { command } } });
      assert.equal(result.status, status, `${command}: ${result.stderr}`);
    }
  });
}
