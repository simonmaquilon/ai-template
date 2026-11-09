// How the check library that the prompt-plan skill copies into every plan hides values shaped like secrets in the logs
// and console lines it writes: what redact masks and leaves alone, its linear time on hostile input, and runChecks.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { ROOT, makeRepo } from './support.mjs';

const LIB = join(ROOT, '.agents', 'skills', 'prompt-plan', 'scripts', 'node', 'check-lib.mjs');
const { redact } = await import(pathToFileURL(LIB).href);
const MIB = 1024 * 1024;

test('prompt-plan redact: masks key/value pairs, keeping the key and the text around the value', () => {
  const cases = [
    ['Data Source=x;User Id=u;Password=s3cr3t;', 'Data Source=x;User Id=u;Password=[REDACTED];'],
    ['PWD=abc', 'PWD=[REDACTED]'],
    ['DB_PASSWORD=abc', 'DB_PASSWORD=[REDACTED]'],
    ['User Password=abc', 'User Password=[REDACTED]'],
    ['client_secret=abc&x=1', 'client_secret=[REDACTED]&x=1'],
    ['access-token=abc,next', 'access-token=[REDACTED],next'],
    ['x.api_key=abc', 'x.api_key=[REDACTED]'],
    ['"api_key": "abc"', '"api_key": [REDACTED]'],
    ['{"password": "a b", "user": "u"}', '{"password": [REDACTED], "user": "u"}'],
    ["secret_key = 'abc def'", 'secret_key = [REDACTED]'],
    ['PRIVATE-KEY: abc', 'PRIVATE-KEY: [REDACTED]'],
    ['token: abc', 'token: [REDACTED]'],
    ['--password=abc', '--password=[REDACTED]'],
    ['password="unterminated', 'password=[REDACTED]'],
    ['"password": "ab\\"cd", "user": "u"', '"password": [REDACTED], "user": "u"'],
    ["secret='ab\\'cd' next", 'secret=[REDACTED] next'],
  ];
  for (const [input, expected] of cases) assert.equal(redact(input), expected, input);
});

test('prompt-plan redact: masks the value of a command line flag, also in the Windows-quoted form lib prints', () => {
  assert.equal(redact('node x.mjs --password abc --other'), 'node x.mjs --password [REDACTED] --other');
  assert.equal(redact('"node" "x.mjs" "--password" "abc"'), '"node" "x.mjs" "--password" [REDACTED]');
  assert.equal(redact('--api-key abc'), '--api-key [REDACTED]');
  assert.equal(redact('--db-token abc'), '--db-token [REDACTED]');
});

test('prompt-plan redact: masks the password of a URL and the credentials of an authorization header', () => {
  assert.equal(redact('postgres://user:pass@host:5432/db'), 'postgres://user:[REDACTED]@host:5432/db');
  assert.equal(redact('see git+ssh://:tok@host/x'), 'see git+ssh://:[REDACTED]@host/x');
  assert.equal(redact('http://u:p@ss@host/'), 'http://u:[REDACTED]@host/');
  assert.equal(redact('Authorization: Bearer abc.def-1'), 'Authorization: Bearer [REDACTED]');
  assert.equal(redact('Authorization: Basic YWJj=='), 'Authorization: Basic [REDACTED]');
  assert.equal(redact('curl -H "Authorization: Bearer abc"'), 'curl -H "Authorization: Bearer [REDACTED]"');
  assert.equal(redact('got Bearer abc'), 'got Bearer [REDACTED]');
});

test('prompt-plan redact: leaves text that only looks like a secret as it is, and masking twice changes nothing', () => {
  for (const text of ['PASSWORD_HASH_ALGO=bcrypt', 'tokens=5', 'keyboard: x', 'secretary=x', 'https://user@host/path',
    'https://host:8080/path', 'the password is required', 'Password=;', 'mypassword=x', '']) {
    assert.equal(redact(text), text, text);
  }
  const once = redact('Password=abc --password x postgres://u:p@h Bearer z');
  assert.equal(redact(once), once);
});

test('prompt-plan redact: runs in linear time on hostile inputs of 1 MiB', () => {
  const rep = (unit) => unit.repeat(Math.ceil(MIB / unit.length));
  const hostile = {
    'letters before ://': `${'a'.repeat(MIB)}://`,
    'dotted letters before ://': `${rep('a.')}://x`,
    'dashes': '-'.repeat(MIB),
    'double dashes': rep('--'),
    'flags with prefixes': rep('--a-b-'),
    'password= repeated': rep('password='),
    'password=" repeated': rep('password="'),
    "password=' repeated": rep("password='"),
    'password then spaces': `password${' '.repeat(MIB)}`,
    'password= then spaces': `password=${' '.repeat(MIB)}x`,
    'one huge value': `password=${'a'.repeat(MIB)}`,
    'one huge quoted value': `password="${'a'.repeat(MIB)}`,
    'escapes in a quoted value': `password="${rep('\\a')}`,
    'password="\\ repeated': rep('password="\\'),
    '--password repeated': rep('--password '),
    'Bearer repeated': rep('Bearer '),
    'Bearer then spaces': `Bearer${' '.repeat(MIB)}`,
    'Authorization repeated': rep('Authorization: '),
    'colons after ://': `x://${rep('a:')}`,
    'schemes without userinfo': rep('a://a:'),
    'userinfo without at': `x://u:${'p:'.repeat(MIB / 2)}`,
    'tokens of mixed shape': rep('secret_key"\t:'),
  };
  for (const [name, input] of Object.entries(hostile)) {
    const started = process.hrtime.bigint();
    redact(input);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(ms < 1000, `${name} took ${Math.round(ms)} ms`);
  }
});

test('prompt-plan redact: runChecks hides secrets in the log and console lines, never in what the check itself reads', (t) => {
  const repo = makeRepo(t);
  const check = join(repo.dir, '.temp', 'plans', 'p', 'check');
  mkdirSync(check, { recursive: true });
  cpSync(LIB, join(check, 'lib.mjs'));
  repo.write('print.mjs', "console.log('Server=x;Password=s3cr3t;');\n");
  writeFileSync(join(check, '01-check.mjs'), "import { command, condition, runChecks, runOnce } from './lib.mjs';\n"
    + `const once = runOnce('p', ${JSON.stringify(process.execPath)}, ['print.mjs', '--password', 's3cr3t']);\n`
    + `runChecks('01', [command('C1', 'prints a secret', ${JSON.stringify(process.execPath)}, ['print.mjs', '--password', 's3cr3t']),\n`
    + "  condition('C2', 'label token=s3cr3t', true, `detail Authorization: Bearer s3cr3t\\n${once.output}`)], ['extra pwd=s3cr3t']);\n"
    + "console.log('cache kept', once.output.includes('s3cr3t'));\n");
  const run = spawnSync(process.execPath, [join(check, '01-check.mjs')], { cwd: repo.dir, encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  const review = join(repo.dir, '.temp', 'plans', 'p', 'review');
  const [name] = readdirSync(review);
  const log = readFileSync(join(review, name), 'utf8');
  for (const [where, text] of [['log', log], ['console', run.stdout]]) assert.doesNotMatch(text, /s3cr3t/, where);
  assert.match(log, /Password=\[REDACTED\];/);
  assert.match(log, /--password"? \[REDACTED\]/);
  assert.match(log, /extra pwd=\[REDACTED\]/);
  assert.match(log, /Bearer \[REDACTED\]/);
  assert.match(run.stdout, /PASS {4}C2: label token=\[REDACTED\]/);
  assert.match(run.stdout, /cache kept true/, 'the value runOnce returns to the script stays whole');
});

test('prompt-plan redact: an argument cmd.exe cannot pass reaches neither the log nor the console', (t) => {
  const repo = makeRepo(t);
  const check = join(repo.dir, '.temp', 'plans', 'p', 'check');
  mkdirSync(check, { recursive: true });
  cpSync(LIB, join(check, 'lib.mjs'));
  repo.write('print.mjs', '');
  writeFileSync(join(check, '01-check.mjs'), "import { command, runChecks } from './lib.mjs';\n"
    + `runChecks('01', [command('C1', 'odd secret', ${JSON.stringify(process.execPath)}, ['print.mjs', '--password', 'Pa%ss!1'])]);\n`);
  const run = spawnSync(process.execPath, [join(check, '01-check.mjs')], { cwd: repo.dir, encoding: 'utf8' });
  const review = join(repo.dir, '.temp', 'plans', 'p', 'review');
  const log = readFileSync(join(review, readdirSync(review)[0]), 'utf8');
  for (const [where, text] of [['log', log], ['console', `${run.stdout}${run.stderr}`]]) {
    if (process.platform === 'win32') assert.doesNotMatch(text, /Pa%ss/, where);
  }
  if (process.platform === 'win32') assert.match(log, /cannot pass .* argument 3/);
});
