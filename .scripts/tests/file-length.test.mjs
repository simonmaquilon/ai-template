import assert from 'node:assert/strict';
import { existsSync, mkdirSync, symlinkSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, hookFor, makeRepo, numbered, runClientHook } from './support.mjs';

const check = (repo) => repo.script('check-file-length.mjs');

test('exempt formats pass and CMakeLists.txt counts as source', (t) => {
  const repo = makeRepo(t);
  for (const name of ['data.jsonl', 'Package.resolved', 'gradle.lockfile', '.editorconfig', 'notebook.ipynb', 'LICENSE-MIT', 'CONTRIBUTING']) {
    repo.write(name, numbered(200));
  }
  const exempt = check(repo);
  assert.equal(exempt.status, 0, exempt.stderr);
  repo.write('CMakeLists.txt', numbered(200));
  const counted = check(repo);
  assert.equal(counted.status, 2);
  assert.match(counted.stderr, /CMakeLists\.txt \(200 lines, new\)/);
});

test('the -source-file-limit attribute exempts a file the check would count', (t) => {
  const repo = makeRepo(t);
  repo.write('generated.py', numbered(200));
  repo.write('.gitattributes', 'generated.py -source-file-limit\n');
  assert.equal(check(repo).status, 0);
});

test('a file already over the limit may change but not grow, also below the root', (t) => {
  const repo = makeRepo(t);
  for (const path of ['legacy.py', 'src/nested/legacy.py']) repo.write(path, numbered(200));
  repo.git('add', '--', '.gitignore', 'legacy.py', 'src/nested/legacy.py');
  repo.git('commit', '-q', '-m', 'baseline');
  repo.write('legacy.py', numbered(199) + 'changed\n');
  repo.write('src/nested/legacy.py', numbered(199) + 'changed\n');
  const unchanged = check(repo);
  assert.equal(unchanged.status, 0, unchanged.stderr);
  repo.write('src/nested/legacy.py', numbered(201));
  const grown = check(repo);
  assert.equal(grown.status, 2);
  assert.match(grown.stderr, /src\/nested\/legacy\.py \(201 lines, was 200\)/);
});

test('a base revision checks the files committed since it', (t) => {
  const repo = makeRepo(t);
  repo.git('add', '--', '.gitignore');
  repo.git('commit', '-q', '-m', 'base');
  repo.write('big.py', numbered(151));
  repo.git('add', '--', 'big.py');
  repo.git('commit', '-q', '-m', 'big');
  const head = check(repo);
  assert.equal(head.status, 0, head.stderr);
  const since = repo.script('check-file-length.mjs', ['--base', 'HEAD~1']);
  assert.equal(since.status, 2);
  assert.match(since.stderr, /big\.py \(151 lines, new\)/);
});

test('an unresolvable base revision falls back to the parent of HEAD', (t) => {
  const repo = makeRepo(t);
  repo.write('legacy.py', numbered(200));
  repo.git('add', '--', '.gitignore', 'legacy.py');
  repo.git('commit', '-q', '-m', 'baseline');
  repo.write('big.py', numbered(151));
  repo.git('add', '--', 'big.py');
  repo.git('commit', '-q', '-m', 'big');
  const result = repo.script('check-file-length.mjs', ['--base', '0'.repeat(40)]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /is not a commit in this repository; checking against the parent of HEAD/);
  assert.match(result.stderr, /big\.py \(151 lines, new\)/);
  assert.doesNotMatch(result.stderr, /legacy\.py/);
});

test('without a parent of HEAD, an unresolvable or missing base counts every file as new', (t) => {
  const repo = makeRepo(t);
  repo.write('legacy.py', numbered(200));
  repo.git('add', '--', '.gitignore', 'legacy.py');
  repo.git('commit', '-q', '-m', 'baseline');
  for (const args of [['--base', '0'.repeat(40)], ['--base']]) {
    const result = repo.script('check-file-length.mjs', args);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /is not a commit in this repository; counting every file as new/);
    assert.match(result.stderr, /legacy\.py \(200 lines, new\)/);
  }
});

for (const client of ['claude', 'codex']) {
  test(`${client}: the turn-end pass checks only files changed during the turn`, (t) => {
    const repo = makeRepo(t);
    mkdirSync(join(repo.dir, 'sub'));
    const session = { session_id: `session-${client}` };
    repo.write('old.go', numbered(151));
    const past = new Date(Date.now() - 60_000);
    utimesSync(join(repo.dir, 'old.go'), past, past);
    const start = runClientHook(client, hookFor(client, 'UserPromptSubmit', '--turn-start'), repo, { input: session });
    assert.equal(start.status, 0, start.stderr);
    assert.ok(existsSync(join(repo.dir, '.temp', 'check-file-length', session.session_id)));
    const stop = hookFor(client, 'Stop', 'check-file-length.mjs');
    const cwd = join(repo.dir, 'sub');
    assert.equal(runClientHook(client, stop, repo, { cwd, input: { ...session, stop_hook_active: false } }).status, 0);
    repo.write('new.go', numbered(151));
    const late = runClientHook(client, stop, repo, { cwd, input: { ...session, stop_hook_active: false } });
    assert.equal(late.status, 2);
    assert.match(late.stderr, /new\.go \(151 lines, new\)/);
    assert.doesNotMatch(late.stderr, /old\.go/);
    assert.equal(runClientHook(client, stop, repo, { cwd, input: { ...session, stop_hook_active: true } }).status, 0);
  });

  test(`${client}: the edit hook resolves relative, absolute, and patch paths`, (t) => {
    const repo = makeRepo(t);
    repo.write('sub/deep.go', numbered(151));
    const edit = hookFor(client, 'PostToolUse', 'check-file-length.mjs');
    const cwd = join(repo.dir, 'sub');
    const relative = runClientHook(client, edit, repo, { cwd, input: { cwd, tool_input: { file_path: 'deep.go' } } });
    assert.equal(relative.status, 2, relative.stderr);
    assert.match(relative.stderr, /sub\/deep\.go \(151 lines, new\)/);
    const absolute = { tool_input: { file_path: join(repo.dir, 'sub', 'deep.go') } };
    assert.equal(runClientHook(client, edit, repo, { input: absolute }).status, 2);
    const patch = { cwd, tool_input: { command: '*** Begin Patch\n*** Add File: deep.go\n*** End Patch' } };
    assert.equal(runClientHook(client, edit, repo, { cwd, input: patch }).status, 2);
    if (WINDOWS) {
      const backslash = { tool_input: { file_path: 'sub\\deep.go' } };
      assert.equal(runClientHook(client, edit, repo, { input: backslash }).status, 2);
    }
  });

  test(`${client}: the edit hook judges a file reached through a linked directory by its real location`, (t) => {
    const repo = makeRepo(t);
    repo.write('vendor/big.js', numbered(200));
    repo.write('.gitattributes', 'vendor/** linguist-vendored\n');
    try {
      symlinkSync(join(repo.dir, 'vendor'), join(repo.dir, 'linked'), WINDOWS ? 'junction' : 'dir');
    } catch (error) {
      t.skip(`cannot create a directory link: ${error.code}`);
      return;
    }
    const edit = hookFor(client, 'PostToolUse', 'check-file-length.mjs');
    const input = { tool_input: { file_path: join(repo.dir, 'linked', 'big.js') } };
    const result = runClientHook(client, edit, repo, { input });
    assert.equal(result.status, 0, result.stderr);
  });
}
