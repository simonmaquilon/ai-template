import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { MANIFEST, cli, commit, readOnly, template } from './template-manifest-fixture.mjs';

// A project that adopted release 1.0.0, with the branch `release` holding 1.1.0 and the project's own edits on top.
function adopted(t) {
  const repo = template(t);
  for (const name of ['take', 'merge', 'del', 'kept', 'lost', 'local', 'same', 'gone']) repo.write(`${name}.txt`, `${name} 0\n`);
  commit(repo);
  cli(repo, '--write');
  commit(repo);
  repo.git('checkout', '-q', '-b', 'release');
  for (const name of ['take', 'merge', 'lost', 'same', 'fresh', 'add']) repo.write(`${name}.txt`, `${name} 1\n`);
  repo.git('rm', '-q', 'del.txt', 'kept.txt', 'gone.txt');
  repo.write('.agents/template-version', '1.1.0\n');
  repo.git('add', '-A');
  cli(repo, '--write');
  commit(repo);
  repo.git('checkout', '-q', '-');
  for (const [name, text] of [['merge', 'merge 2'], ['fresh', 'fresh 0'], ['kept', 'kept 2'], ['local', 'local 1'], ['same', 'same 1']]) {
    repo.write(`${name}.txt`, `${text}\n`);
  }
  rmSync(join(repo.dir, 'lost.txt'));
  rmSync(join(repo.dir, 'gone.txt'));
  return repo;
}

test('--compare classifies each path against the manifest of the new release and writes nothing', (t) => {
  const repo = adopted(t);
  const result = readOnly(repo, '--compare', 'release');
  assert.equal(result.status, 0, result.stderr);
  const listed = [...result.stdout.matchAll(/^(take|merge|add|delete|review) (.+)$/gm)];
  assert.deepEqual(Object.fromEntries(listed.map(([, action, path]) => [path, action])), {
    '.agents/template-version': 'take', 'take.txt': 'take', 'merge.txt': 'merge', 'fresh.txt': 'merge', 'add.txt': 'add',
    'del.txt': 'delete', 'kept.txt': 'review', 'lost.txt': 'review',
  });
  const order = listed.map(([, action]) => ['take', 'merge', 'add', 'delete', 'review'].indexOf(action));
  assert.deepEqual(order, [...order].sort(), 'grouped by action');
  assert.match(result.stdout, /^adopted version: 1\.0\.0$/m);
  assert.match(result.stdout, /^new version: 1\.1\.0$/m);
  assert.match(result.stdout, /^no action: \d+ identical to the new release, 1 changed only in this project$/m);
});

test('--compare exits 1 for a release or an adopted manifest it cannot read', (t) => {
  const repo = adopted(t);
  assert.equal(readOnly(repo, '--compare', 'no-such-ref').status, 1);
  assert.equal(readOnly(repo, '--compare', 'HEAD~1').status, 1);
  rmSync(join(repo.dir, '.agents', 'template-manifest.json'));
  const result = readOnly(repo, '--compare', 'release');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no adopted release/);
});

test('--compare refuses a release manifest with a path that leaves the repository, reaches .git, or holds a control character', (t) => {
  const repo = template(t);
  cli(repo, '--write');
  const adopted = readFileSync(join(repo.dir, MANIFEST), 'utf8');
  const cases = { 'docs/.gitkeep': 0, '../x.txt': 1, '/x.txt': 1, 'C:x.txt': 1, '.git/config': 1, 'sub/.GIT/hooks/pre-commit': 1,
    'x.txt\ntake forged.txt': 1, 'x\u007f.txt': 1 };
  for (const [path, status] of Object.entries(cases)) {
    repo.write(MANIFEST, JSON.stringify({ version: '1.1.0', files: { [path]: '0'.repeat(40) } }));
    commit(repo);
    repo.write(MANIFEST, adopted);
    const result = readOnly(repo, '--compare', 'HEAD');
    assert.equal(result.status, status, JSON.stringify(path));
    assert.doesNotMatch(result.stdout, /^take forged/m);
  }
});
