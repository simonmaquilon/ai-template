import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, hookFor, makeRepo, runClientHook } from './support.mjs';
import { postToolContext } from './hook-context.mjs';

for (const client of ['claude', 'codex']) {
  const scan = (repo, toolInput, cwd = repo.dir) => {
    const result = runClientHook(client, hookFor(client, 'PostToolUse', 'check-security.mjs'), repo,
      { cwd, input: { cwd, hook_event_name: 'PostToolUse', tool_input: toolInput } });
    return { ...result, context: postToolContext(result) };
  };

  test(`${client}: security guidance warns without exposing source values or blocking`, (t) => {
    const repo = makeRepo(t);
    const fake = 'SYNTHETIC_NOT_A_REAL_CREDENTIAL';
    repo.write('src/app.js', `element.innerHTML = request.body;\neval(request.body);\nconst apiKey = "${fake}";\n`);
    const result = scan(repo, { file_path: 'src/app.js' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.context, /08-security-and-data\.md/);
    assert.match(result.context, /not confirmed vulnerabilities/);
    assert.match(result.context, /src\/app\.js.*:1.*html-injection/);
    assert.match(result.context, /:2.*code-eval/);
    assert.match(result.context, /:3.*credential-literal/);
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

  test(`${client}: security guidance reports only the lines an edit changed, and every line of a new file`, (t) => {
    const repo = makeRepo(t);
    repo.write('old.js', 'eval(oldInput);\nconst ok = 1;\n');
    // Git diffs a -diff file as binary, with no line numbers, unless asked for text.
    repo.write('.gitattributes', 'old.js -diff\n');
    assert.equal(repo.git('add', '--', '.gitignore', '.gitattributes', 'old.js').status, 0);
    assert.equal(repo.git('commit', '-q', '-m', 'initial').status, 0);
    repo.git('config', 'diff.interHunkContext', '10');
    repo.write('old.js', 'eval(oldInput);\nconst ok = 1;\ndocument.write(html);\n');
    const changed = scan(repo, { file_path: 'old.js' });
    assert.match(changed.context, /"old\.js":3 \[CWE-79 html-injection\] .*\(OWASP A05:2025 Injection\)/);
    assert.doesNotMatch(changed.context, /:1 \[/);
    const aws = `AKIA${'B'.repeat(16)}`;
    repo.write('new.js', `eval(a);\nconst id = "${aws}";\nconst pem = "-----BEGIN PRIVATE KEY-----";\n`);
    const fresh = scan(repo, { file_path: 'new.js' });
    assert.match(fresh.context, /"new\.js":1 \[CWE-95 code-eval\]/);
    assert.match(fresh.context, /"new\.js":2 \[CWE-798 credential-literal\]/);
    assert.match(fresh.context, /"new\.js":3 \[CWE-321 private-key\]/);
    assert.doesNotMatch(fresh.stdout, new RegExp(`${aws}|BEGIN`));
    repo.write('many.js', 'eval(a);\n'.repeat(21));
    assert.match(scan(repo, { file_path: 'many.js' }).context, /"many\.js": more than 20 candidates; only the first 20 are shown/);
    repo.write('twenty.js', 'eval(a);\n'.repeat(20));
    assert.doesNotMatch(scan(repo, { file_path: 'twenty.js' }).context, /more than 20/);
  });

  test(`${client}: security guidance resolves paths below the root and scans patch paths only once`, (t) => {
    const repo = makeRepo(t);
    repo.write('src/a.js', 'new Function(input);\n');
    repo.write('src/b.js', 'const options = { rejectUnauthorized: false };\n');
    const patch = '*** Begin Patch\n*** Update File: a.js\n*** Update File: b.js\n*** Update File: a.js\n*** End Patch';
    const result = scan(repo, { command: patch }, join(repo.dir, 'src'));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.context, /code-eval/);
    assert.match(result.context, /tls-verification-off/);
    assert.equal(result.context.match(/code-eval/g).length, 1);
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
    repo.write('.gcloud/local.json', '{"apiKey":"SYNTHETIC_NOT_A_REAL_CREDENTIAL"}');
    repo.write('.codex/auth.json', '{"apiKey":"SYNTHETIC_NOT_A_REAL_CREDENTIAL"}');
    repo.write('.env.local', 'API_KEY=SYNTHETIC_NOT_A_REAL_CREDENTIAL');
    repo.write('.config/gcloud/application_default_credentials.json', '{"marker":"eval(input)"}');
    for (const file of ['linked/unsafe.js', '.aws/local.json', '.gcloud/local.json', '.codex/auth.json', '.env.local',
      '.config/gcloud/application_default_credentials.json']) {
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
    assert.match(large.context, /not scanned.*size limit/);
    assert.doesNotMatch(large.stdout, /code-eval/);
    assert.equal(scan(repo, { file_path: 'binary.js' }).stdout, '');
  });

  test(`${client}: security guidance detects interpolated queries, shell input and unsafe deserialization`, (t) => {
    const repo = makeRepo(t);
    repo.write('unsafe.js', 'db.prepare(`SELECT * FROM users WHERE id = ${input}`);\nexec(`tool ${input}`);\n');
    repo.write('unsafe.py', 'pickle.loads(payload)\nyaml.load(payload)\n');
    const js = scan(repo, { file_path: 'unsafe.js' });
    assert.equal(js.status, 0, js.stderr);
    assert.match(js.context, /sql-interpolation/);
    assert.match(js.context, /command-shell/);
    const py = scan(repo, { file_path: 'unsafe.py' });
    assert.equal(py.status, 0, py.stderr);
    assert.match(py.context, /unsafe-deserialization/);
  });
}
