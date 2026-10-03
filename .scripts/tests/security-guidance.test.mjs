import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, hookFor, makeRepo, run, runClientHook } from './support.mjs';

for (const client of ['claude', 'codex']) {
  const scan = (repo, toolInput, cwd = repo.dir) => runClientHook(client,
    hookFor(client, 'PostToolUse', 'check-security.mjs'), repo,
    { cwd, input: { cwd, tool_input: toolInput } });

  test(`${client}: security guidance warns without exposing source values or blocking`, (t) => {
    const repo = makeRepo(t);
    const fake = 'SYNTHETIC_NOT_A_REAL_CREDENTIAL';
    repo.write('src/app.js', `element.innerHTML = request.body;\neval(request.body);\nconst apiKey = "${fake}";\n`);
    const result = scan(repo, { file_path: 'src/app.js' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /32-security-review-workflow\.md/);
    assert.match(result.stdout, /src\/app\.js.*:1.*html-injection/);
    assert.match(result.stdout, /:2.*dynamic-evaluation/);
    assert.match(result.stdout, /:3.*credential-literal/);
    assert.doesNotMatch(result.stdout, new RegExp(`${fake}|request\\.body`));
    assert.equal(result.stderr, '');
  });

  test(`${client}: security guidance stays quiet for safe code and comments`, (t) => {
    const repo = makeRepo(t);
    repo.write('src/safe.js', '// eval(request.body)\nnode.textContent = input;\nconst apiKey = process.env.API_KEY;\ndb.prepare("SELECT * FROM users WHERE id = ?").bind(id);\n');
    const result = scan(repo, { file_path: 'src/safe.js' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
  });

  test(`${client}: security guidance resolves paths below the root and scans patch paths only once`, (t) => {
    const repo = makeRepo(t);
    repo.write('src/a.js', 'new Function(input);\n');
    repo.write('src/b.js', 'const options = { rejectUnauthorized: false };\n');
    const patch = '*** Begin Patch\n*** Update File: a.js\n*** Update File: b.js\n*** Update File: a.js\n*** End Patch';
    const result = scan(repo, { command: patch }, join(repo.dir, 'src'));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /dynamic-construction/);
    assert.match(result.stdout, /disabled-tls-verification/);
    assert.equal(result.stdout.match(/dynamic-construction/g).length, 1);
  });

  test(`${client}: security guidance excludes ignored, vendored, generated and external paths`, (t) => {
    const repo = makeRepo(t);
    const external = makeRepo(t);
    external.write('unsafe.js', 'eval(input);\n');
    repo.write('.temp/unsafe.js', 'eval(input);\n');
    repo.write('vendor/unsafe.js', 'eval(input);\n');
    repo.write('generated/unsafe.js', 'eval(input);\n');
    repo.write('.gitattributes', 'vendor/** linguist-vendored\ngenerated/** linguist-generated\n');
    for (const file of ['.temp/unsafe.js', 'vendor/unsafe.js', 'generated/unsafe.js', join(external.dir, 'unsafe.js'), 'missing.js']) {
      const result = scan(repo, { file_path: file });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '', file);
    }
  });

  test(`${client}: security guidance respects new ignore rules even for tracked files`, (t) => {
    const repo = makeRepo(t);
    repo.write('private.js', 'eval(input);\n');
    assert.equal(repo.git('add', '--', '.gitignore', 'private.js').status, 0);
    assert.equal(repo.git('commit', '-q', '-m', 'initial').status, 0);
    repo.write('.gitignore', '.temp/\nprivate.js\n');
    const result = scan(repo, { file_path: 'private.js' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
  });

  test(`${client}: security guidance rejects symlink escapes and credential-store paths`, (t) => {
    const repo = makeRepo(t);
    const external = makeRepo(t);
    external.write('unsafe.js', 'eval(input);\n');
    symlinkSync(external.dir, join(repo.dir, 'linked'), WINDOWS ? 'junction' : 'dir');
    repo.write('.aws/local.json', '{"apiKey":"SYNTHETIC_NOT_A_REAL_CREDENTIAL"}');
    repo.write('.codex/auth.json', '{"apiKey":"SYNTHETIC_NOT_A_REAL_CREDENTIAL"}');
    repo.write('.env.local', 'API_KEY=SYNTHETIC_NOT_A_REAL_CREDENTIAL');
    repo.write('.config/gcloud/application_default_credentials.json', '{"marker":"eval(input)"}');
    for (const file of ['linked/unsafe.js', '.aws/local.json', '.codex/auth.json', '.env.local', '.config/gcloud/application_default_credentials.json']) {
      const result = scan(repo, { file_path: file });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '', file);
    }
    mkdirSync(join(repo.dir, 'empty'));
    assert.equal(scan(repo, { file_path: 'empty' }).stdout, '');
  });

  test(`${client}: security guidance reports large-file gaps and skips binary content`, (t) => {
    const repo = makeRepo(t);
    repo.write('large.js', 'eval(input);\n' + 'a'.repeat(1024 * 1024));
    repo.write('binary.js', '\0eval(input);');
    const large = scan(repo, { file_path: 'large.js' });
    assert.equal(large.status, 0, large.stderr);
    assert.match(large.stdout, /not scanned.*size limit/);
    assert.doesNotMatch(large.stdout, /dynamic-evaluation/);
    assert.equal(scan(repo, { file_path: 'binary.js' }).stdout, '');
  });

  test(`${client}: security guidance detects interpolated queries, shell input and unsafe deserialization`, (t) => {
    const repo = makeRepo(t);
    repo.write('unsafe.js', 'db.prepare(`SELECT * FROM users WHERE id = ${input}`);\nexec(`tool ${input}`);\n');
    repo.write('unsafe.py', 'pickle.loads(payload)\nyaml.load(payload)\n');
    const js = scan(repo, { file_path: 'unsafe.js' });
    assert.equal(js.status, 0, js.stderr);
    assert.match(js.stdout, /interpolated-query/);
    assert.match(js.stdout, /shell-input/);
    const py = scan(repo, { file_path: 'unsafe.py' });
    assert.equal(py.status, 0, py.stderr);
    assert.match(py.stdout, /unsafe-deserialization/);
  });
}

// Exercise the shared reader deterministically, including on Windows where
// chmod cannot reliably make a test file unreadable.
test('security guidance reports eligible path-resolution failures without leaking source', (t) => {
  const repo = makeRepo(t);
  repo.write('blocked.js', 'eval(input);\n');
  repo.write('.temp/deny-realpath.mjs', `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const original = fs.realpathSync.native;
fs.realpathSync.native = (path) => {
  if (path.endsWith('blocked.js')) {
    const error = new Error('Synthetic denied path');
    error.code = 'EACCES';
    throw error;
  }
  return original(path);
};
syncBuiltinESMExports();
await import('../.scripts/check-security.mjs');
`);
  const input = JSON.stringify({ cwd: repo.dir, tool_input: { file_path: 'blocked.js' } });
  const result = run(process.execPath, ['.temp/deny-realpath.mjs'], { cwd: repo.dir, input });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /blocked\.js.*not scanned/);
  assert.doesNotMatch(result.stdout, /eval\(input\)/);
});
