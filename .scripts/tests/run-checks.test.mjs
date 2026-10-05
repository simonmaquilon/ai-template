import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, WINDOWS, run } from './support.mjs';

// An unreadable git template makes git init fail the way a sandbox that denies
// writes under .git does; Windows and root read the template anyway.
const unreadable = WINDOWS || process.getuid?.() === 0;

test('run-checks reports the hook tests as blocked, not failed, where git cannot create a repository', { skip: unreadable }, (t) => {
  const templates = mkdtempSync(join(ROOT, '.temp', 'git-template-'));
  const locked = join(templates, 'hooks', 'locked.sample');
  t.after(() => {
    chmodSync(locked, 0o600);
    rmSync(templates, { recursive: true, force: true, maxRetries: 5 });
  });
  mkdirSync(join(templates, 'hooks'));
  writeFileSync(locked, '');
  chmodSync(locked, 0);
  const result = run(process.execPath, [join(ROOT, '.scripts', 'run-checks.mjs')], {
    cwd: ROOT,
    env: { ...process.env, GIT_TEMPLATE_DIR: templates },
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.match(result.stdout, /^BLOCKED hook tests: git cannot create a repository here/m);
  assert.doesNotMatch(result.stdout, /^FAIL /m);
  assert.equal(result.status, 3, result.stdout + result.stderr);
});
