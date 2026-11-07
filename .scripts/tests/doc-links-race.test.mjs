// The empty-directory hook runs at the same time as the link hook and can remove a directory the link hook has
// listed but not yet read; an entry that disappears while it is read counts as absent, and any other failure stays one.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, makeRepo, run } from './support.mjs';

// Runs the link hook with `call` ('statSync' or 'readdirSync') patched so that, the first time it receives `target`
// (a repository path with forward slashes), the directory is removed right before the real call, or, when `code` is
// given, the call fails with that error code instead, or, when `through` is given, the real call receives that path.
function runWithRace(repo, call, target, code = null, through = null) {
  repo.write('.temp/doc-links-race.mjs', `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const original = fs.${call};
let fired = false;
fs.${call} = (path, ...rest) => {
  if (!fired && String(path).replaceAll('\\\\', '/') === ${JSON.stringify(target)}) {
    fired = true;
    if (${JSON.stringify(code)}) throw Object.assign(new Error('Injected failure'), { code: ${JSON.stringify(code)} });
    if (!${JSON.stringify(through)}) fs.rmdirSync(path);
  }
  return original(${JSON.stringify(through)} && fired ? ${JSON.stringify(through)} : path, ...rest);
};
syncBuiltinESMExports();
await import('../.scripts/check-doc-links.mjs');
`);
  return run(process.execPath, ['.temp/doc-links-race.mjs'], { cwd: repo.dir });
}

function makeDocsRepo(t) {
  const repo = makeRepo(t);
  repo.write('README.md', '[missing](missing.md)\n');
  repo.write('.readme/10-guide.md', '[gone](gone.md)\n');
  mkdirSync(join(repo.dir, '.readme', 'vanishing'), { recursive: true });
  repo.write('.docs/product.md', 'Product.\n');
  return repo;
}

function assertReportsOtherDocuments(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /README\.md -> missing\.md/);
  assert.match(result.stdout, /\.readme\/10-guide\.md -> gone\.md/);
}

test('the link hook skips an entry that disappears before its stat and still reports the other documents', (t) => {
  const repo = makeDocsRepo(t);
  const result = runWithRace(repo, 'statSync', '.readme/vanishing');
  assert.equal(existsSync(join(repo.dir, '.readme', 'vanishing')), false);
  assertReportsOtherDocuments(result);
});

test('the link hook skips a directory that disappears after being found and still reports the other documents', (t) => {
  const repo = makeDocsRepo(t);
  const result = runWithRace(repo, 'readdirSync', '.readme/vanishing');
  assert.equal(existsSync(join(repo.dir, '.readme', 'vanishing')), false);
  assertReportsOtherDocuments(result);
});

for (const call of ['statSync', 'readdirSync']) {
  test(`the link hook still fails when ${call} reports an error other than a missing entry`, (t) => {
    const repo = makeDocsRepo(t);
    const result = runWithRace(repo, call, call === 'statSync' ? '.readme/vanishing' : '.docs', 'EACCES');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /EACCES/);
  });
}

// README.md is a file, so the real stat of a path below it fails with ENOTDIR. Windows may report ENOENT instead.
test('the link hook still fails when the real stat reports a path below a file', { skip: WINDOWS }, (t) => {
  const repo = makeDocsRepo(t);
  const result = runWithRace(repo, 'statSync', '.readme/vanishing', null, 'README.md/child');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ENOTDIR/);
});
