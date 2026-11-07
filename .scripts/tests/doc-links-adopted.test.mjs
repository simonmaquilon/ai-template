// A project that adopts the template never receives the template-only files, so no document it owns may cite one:
// the link check must pass in a repository holding every other file the template tracks.

import assert from 'node:assert/strict';
import { cpSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { TEMPLATE_ONLY } from '../template-manifest.mjs';
import { ROOT, makeRepo, run } from './support.mjs';

const templateOnly = (path) => TEMPLATE_ONLY.some((entry) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry));

test('the documentation links resolve in a project that adopts the template without its template-only files', (t) => {
  const repo = makeRepo(t);
  // makeRepo seeds .scripts with every script, template-only ones included; the adopted project starts without them.
  rmSync(join(repo.dir, '.scripts'), { recursive: true, force: true });
  const tracked = run('git', ['ls-files', '-z'], { cwd: ROOT }).stdout.split('\0').filter(Boolean);
  for (const path of tracked.filter((candidate) => !templateOnly(candidate))) {
    const source = join(ROOT, path);
    const target = join(repo.dir, path);
    mkdirSync(dirname(target), { recursive: true });
    if (lstatSync(source).isSymbolicLink()) {
      rmSync(target, { force: true });
      symlinkSync(readlinkSync(source), target);
    } else {
      cpSync(source, target);
    }
  }
  const added = repo.git('add', '-A');
  assert.equal(added.status, 0, added.stderr);
  const result = repo.script('check-doc-links.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});
