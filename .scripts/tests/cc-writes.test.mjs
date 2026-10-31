import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, WINDOWS, run } from './support.mjs';

// A throwaway folder under .temp/ holding a copy of the script and the given folders; the script needs no git.
function makeTree(t, folders = []) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.temp', 'cc-writes-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  mkdirSync(join(dir, '.scripts'));
  cpSync(join(ROOT, '.scripts', 'remove-cc-writes.mjs'), join(dir, '.scripts', 'remove-cc-writes.mjs'));
  for (const folder of folders) mkdirSync(join(dir, folder), { recursive: true });
  return {
    dir,
    has: (path) => existsSync(join(dir, path)),
    remove: (cwd = dir) => run(process.execPath, [join(dir, '.scripts', 'remove-cc-writes.mjs')], { cwd }),
  };
}

test('cc-writes cleanup removes the empty folders below the root, from any folder, with the .claude they leave empty', (t) => {
  const tree = makeTree(t, ['.claude/.cc-writes', 'src/.claude/.cc-writes', '.temp/nested/.claude/.cc-writes',
    'docs/.claude/.cc-writes', 'lib/.cc-writes', 'busy/.claude/.cc-writes']);
  writeFileSync(join(tree.dir, 'docs', '.claude', 'settings.json'), '{}\n');
  writeFileSync(join(tree.dir, 'busy', '.claude', '.cc-writes', 'pending'), 'kept\n');
  const result = tree.remove(join(tree.dir, 'src'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(tree.has('.claude/.cc-writes'), true);
  assert.equal(tree.has('src/.claude'), false);
  assert.equal(tree.has('src'), true);
  assert.equal(tree.has('.temp/nested/.claude'), false);
  assert.equal(tree.has('docs/.claude/.cc-writes'), false);
  assert.equal(tree.has('docs/.claude/settings.json'), true);
  assert.equal(tree.has('lib/.cc-writes'), true);
  assert.equal(tree.has('busy/.claude/.cc-writes/pending'), true);
  const lines = result.stdout.split('\n');
  for (const path of ['src/.claude/.cc-writes', 'src/.claude', '.temp/nested/.claude/.cc-writes', '.temp/nested/.claude',
    'docs/.claude/.cc-writes']) assert.ok(lines.includes(`./${path}`), `${path} is not listed:\n${result.stdout}`);
  for (const path of ['.claude/.cc-writes', 'docs/.claude', 'lib/.cc-writes']) assert.equal(lines.includes(`./${path}`), false, path);
  assert.match(result.stdout, /^\.\/busy\/\.claude\/\.cc-writes \((ENOTEMPTY|EEXIST)\)$/m);
});

test('cc-writes cleanup does not follow a symlink out of the repository', (t) => {
  const outside = makeTree(t, ['target/.claude/.cc-writes']);
  const tree = makeTree(t);
  symlinkSync(join(outside.dir, 'target'), join(tree.dir, 'linked'), WINDOWS ? 'junction' : 'dir');
  const result = tree.remove();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(outside.has('target/.claude/.cc-writes'), true);
  assert.equal(result.stdout, 'No .claude/.cc-writes folders to remove.\n');
});

test('cc-writes cleanup lists a folder the system refuses to remove and still removes the others', (t) => {
  const tree = makeTree(t, ['protected/.claude/.cc-writes', 'free/.claude/.cc-writes']);
  writeFileSync(join(tree.dir, '.scripts', 'refusing.mjs'), `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const remove = fs.rmdirSync;
fs.rmdirSync = (path) => {
  if (path !== 'protected/.claude/.cc-writes') return remove(path);
  const error = new Error('Operation not permitted');
  error.code = 'EPERM';
  throw error;
};
syncBuiltinESMExports();
await import('./remove-cc-writes.mjs');
`);
  const result = run(process.execPath, [join(tree.dir, '.scripts', 'refusing.mjs')], { cwd: tree.dir });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(tree.has('protected/.claude/.cc-writes'), true);
  assert.equal(tree.has('free/.claude'), false);
  assert.match(result.stdout, /^\.\/protected\/\.claude\/\.cc-writes \(EPERM\)$/m);
});
