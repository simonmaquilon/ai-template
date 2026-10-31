import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { MANIFEST, ONLY, cli, readOnly, template } from './template-manifest-fixture.mjs';
import { WINDOWS, run } from './support.mjs';

const manifest = (repo) => JSON.parse(readFileSync(join(repo.dir, MANIFEST), 'utf8'));
const blob = (repo, path) => repo.git('hash-object', path).stdout.trim();

test('--write records the owned files by git blob id, in code-unit order, without the template-only files or itself', (t) => {
  const repo = template(t);
  const tracked = repo.git('ls-files').stdout.split('\n');
  assert.ok(ONLY.every((path) => tracked.includes(path)), 'the template-only files are tracked');
  assert.equal(cli(repo, '--write').status, 0);
  const text = readFileSync(join(repo.dir, MANIFEST), 'utf8');
  const { version, files } = JSON.parse(text);
  const paths = Object.keys(files);
  assert.equal(version, '1.0.0');
  assert.equal(text, `${JSON.stringify({ version, files }, null, 2)}\n`);
  assert.ok(paths.indexOf('B.txt') < paths.indexOf('a.txt'), 'upper case sorts before lower case');
  assert.deepEqual(paths, [...paths].sort());
  assert.ok(paths.includes('.scripts/hook-support.mjs') && paths.includes('.scripts/template-manifest.mjs'));
  assert.deepEqual(paths.filter((path) => ONLY.includes(path) || path === MANIFEST), []);
  for (const path of ['a.txt', 'docs/c.md', 'crlf.txt']) assert.equal(files[path], blob(repo, path), path);
  assert.equal(files['crlf.txt'], run('git', ['hash-object', '--stdin'], { cwd: repo.dir, input: 'x\ny\n' }).stdout.trim());
  repo.git('add', MANIFEST);
  assert.equal(cli(repo, '--write').status, 0);
  assert.equal(readFileSync(join(repo.dir, MANIFEST), 'utf8'), text);
});

test('--write hashes a symlink by its target text', { skip: WINDOWS }, (t) => {
  const repo = template(t);
  symlinkSync('a.txt', join(repo.dir, 'link'));
  repo.git('add', 'link');
  assert.equal(cli(repo, '--write').status, 0);
  assert.equal(manifest(repo).files.link, repo.git('ls-files', '-s', 'link').stdout.split(/\s/)[1]);
});

test('--write is refused unless origin is the recorded template, in any spelling of its URL', (t) => {
  const repo = template(t);
  repo.git('remote', 'set-url', 'origin', 'https://example.invalid/someone/fork.git');
  const refused = cli(repo, '--write');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /allowed only in the maintained template/);
  assert.equal(existsSync(join(repo.dir, MANIFEST)), false);
  repo.git('remote', 'set-url', 'origin', 'GIT@Example.invalid:owner/template/');
  assert.equal(cli(repo, '--write').status, 0);
});

test('--check passes when current and names the path that changed, was added or removed, or the version', (t) => {
  const repo = template(t);
  const missing = readOnly(repo, '--check');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /missing or unreadable/);
  cli(repo, '--write');
  repo.git('add', MANIFEST);
  assert.equal(readOnly(repo, '--check').status, 0);
  repo.write('a.txt', 'edited\n');
  assert.match(readOnly(repo, '--check').stdout, /^changed: a\.txt$/m);
  repo.write('a.txt', 'a\n');
  repo.write('added.txt', 'new\n');
  repo.git('add', 'added.txt');
  const added = readOnly(repo, '--check');
  assert.equal(added.status, 1);
  assert.match(added.stdout, /^added: added\.txt$/m);
  repo.git('rm', '-q', '-f', 'added.txt', 'docs/c.md');
  assert.match(readOnly(repo, '--check').stdout, /^removed: docs\/c\.md$/m);
  cli(repo, '--write');
  repo.write('.agents/template-version', '2.0.0\n');
  assert.match(readOnly(repo, '--check').stdout, /^version: the manifest says 1\.0\.0, .* says 2\.0\.0$/m);
  rmSync(join(repo.dir, MANIFEST));
  assert.equal(readOnly(repo, '--check').status, 1);
});

test('misuse exits 2', (t) => {
  const repo = template(t);
  for (const args of [[], ['--nope'], ['--compare'], ['--check', 'extra'], ['--compare', '--output=x']]) {
    assert.equal(cli(repo, ...args).status, 2, args.join(' '));
  }
});
