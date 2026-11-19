// What redact of the check library that prompt-plan copies into every plan masks without a key before the value: tokens
// of GitHub, Anthropic and OpenAI style, AWS key ids, Slack tokens, JWTs, and private key blocks. Every sample is built by
// concatenation so that no literal with the shape of a secret stays in the repository.

import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { ROOT } from './support.mjs';

const LIB = join(ROOT, '.agents', 'skills', 'prompt-plan', 'scripts', 'node', 'check-lib.mjs');
const { redact } = await import(pathToFileURL(LIB).href);
const MIB = 1024 * 1024;
const PEM_END = '-----END ' + 'PRIVATE KEY-----';
const pem = (kind) => '-----BEGIN ' + kind + 'PRIVATE KEY-----';
const body = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC\nKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj\n';

test('prompt-plan redact shapes: masks a token by its prefix, whatever surrounds it', () => {
  const cases = [
    ...['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_'].map((prefix) => [`see ${prefix}${'A1'.repeat(18)} end`, `see ${prefix}[REDACTED] end`]),
    ['github_pat_' + '11A'.repeat(7) + '_' + 'b'.repeat(59), 'github_pat_[REDACTED]'],
    ['key sk-' + 'a'.repeat(20) + '.', 'key sk-[REDACTED].'],
    ['"sk-ant-' + 'api03-' + 'Xy_9'.repeat(10) + '"', '"sk-[REDACTED]"'],
    ['sk-proj-' + 'Ab1-'.repeat(12), 'sk-[REDACTED]'],
    ['id AKIA' + 'IOSFODNN7EXAMPLE' + ' ok', 'id AKIA[REDACTED] ok'],
    ['ASIA' + '0123456789ABCDEF', 'ASIA[REDACTED]'],
    ...['b', 'p', 'a', 'r', 's'].map((kind) => [`(xox${kind}-` + '123456789012-' + 'abcDEF0123456789)', `(xox${kind}-[REDACTED])`]),
    ['jwt eyJ' + 'hbGciOiJIUzI1NiJ9' + '.eyJ' + 'zdWIiOiIxMjM0NTY3ODkwIn0' + '.' + 'abcDEF_-123' + ' done', 'jwt eyJ[REDACTED] done'],
    [pem('') + '\n' + body + PEM_END, pem('') + '[REDACTED]' + PEM_END],
    [`a\n${pem('RSA ')}\n${body}-----END RSA PRIVATE KEY-----\nb`, `a\n${pem('RSA ')}[REDACTED]-----END RSA PRIVATE KEY-----\nb`],
    [pem('OPENSSH ') + '\n' + body, pem('OPENSSH ') + '[REDACTED]'],
    [pem('') + body + 'x'.repeat(40), pem('') + '[REDACTED]'],
    [pem('ENCRYPTED ') + 'x' + PEM_END + ' ' + pem('EC ') + 'y', pem('ENCRYPTED ') + '[REDACTED]' + PEM_END + ' ' + pem('EC ') + '[REDACTED]'],
  ];
  for (const [input, expected] of cases) assert.equal(redact(input), expected, expected);
});

test('prompt-plan redact shapes: leaves ordinary text, public certificates, and hashes as they are', () => {
  const cert = '-----BEGIN ' + 'CERTIFICATE-----\n' + body + '-----END CERTIFICATE-----';
  const texts = ['task-1234', 'risk-assessment-' + 'a'.repeat(30), 'desk-' + 'a'.repeat(30), 'sk-1', 'sk-' + 'a'.repeat(19),
    'akia' + 'iosfodnn7example', 'Akia' + 'IOSFODNN7EXAMPLE', 'AKIA' + 'IOSFODNN7EXAMPL', 'AKIA' + 'IOSFODNN7EXAMPLE' + 'X', 'ghp_short', 'xoxb-1',
    'eyJ', 'eyJhbGciOiJIUzI1NiJ9', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0', 'a.b.c', 'eyJ' + 'abc' + '.e30.' + 'abc', cert,
    'commit 9fceb02d0ae598e95dc970b74767f19372d61af8', 'sha256 ' + 'ab12'.repeat(16), 'PRIVATE KEY', '-----BEGIN PUBLIC KEY-----\nabc'];
  for (const text of texts) assert.equal(redact(text), text, text);
});

test('prompt-plan redact shapes: masking a token twice changes nothing', () => {
  const text = ['ghp_' + 'A'.repeat(36), 'sk-' + 'a'.repeat(30), 'AKIA' + 'IOSFODNN7EXAMPLE', 'xoxb-' + 'a'.repeat(20),
    'eyJ' + 'aaaaa' + '.eyJ' + 'bbbbb' + '.ccccc', pem('') + body + PEM_END, pem('') + body].join('\n');
  const once = redact(text);
  assert.doesNotMatch(once, /AAAAAAAA|IOSFODNN|MIIEv|aaaaaaaa/);
  assert.equal(redact(once), once);
});

test('prompt-plan redact shapes: each new pattern runs in linear time on hostile inputs of 1 MiB', () => {
  const rep = (unit) => unit.repeat(Math.ceil(MIB / unit.length));
  const hostile = {
    'ghp_ repeated': rep('ghp_'), 'ghp_ one short of a token repeated': rep('ghp_' + 'a'.repeat(19) + ' '), 'ghp_ then one huge token': 'ghp_' + 'a'.repeat(MIB),
    'github_pat_ repeated': rep('github_pat_'), 'github_pat_ with underscores': 'github_pat_' + '_'.repeat(MIB), 'gh letters before ghp_': 'a'.repeat(MIB) + 'ghp_',
    'sk- repeated': rep('sk-'), 'sk- one short repeated': rep('sk-' + 'a'.repeat(19) + ' '), 'sk- then dashes': 'sk-' + '-'.repeat(MIB), 'sk- then one huge token': 'sk-' + 'a'.repeat(MIB),
    'AKIA repeated': rep('AKIA'), 'AKIA one short repeated': rep('AKIA' + 'A'.repeat(15) + ' '), 'AKIA then one huge run': 'AKIA' + 'A'.repeat(MIB),
    'xoxb- repeated': rep('xoxb-'), 'xoxb- then dashes': 'xoxb-' + '-'.repeat(MIB), 'xoxb- one short repeated': rep('xoxb-' + 'a'.repeat(9) + ' '),
    'eyJ then one huge segment': 'eyJ' + 'a'.repeat(MIB), 'eyJ. repeated': rep('eyJ.'), 'eyJ.eyJ repeated': rep('eyJ.eyJ'), 'eyJa.eyJb. repeated': rep('eyJa.eyJb.'),
    'eyJ.eyJ. then dots': 'eyJ.eyJ.' + '.'.repeat(MIB), 'eyJ segments of a million': `eyJ${'a'.repeat(MIB / 2)}.eyJ${'b'.repeat(MIB / 2)}`,
    'BEGIN prefix repeated': rep('-----BEGIN '), 'BEGIN with long kind repeated': rep('-----BEGIN ' + 'A'.repeat(40)), 'BEGIN PRIVATE KEY repeated': rep(pem('')),
    'BEGIN then dashes': pem('') + '-'.repeat(MIB), 'BEGIN then half-written END': pem('') + rep('-----END PRIVATE KE'), 'BEGIN then one huge body': pem('') + 'a'.repeat(MIB),
    'BEGIN then many ENDs': pem('') + rep(PEM_END), 'BEGIN kind of spaces': '-----BEGIN ' + ' '.repeat(MIB),
  };
  for (const [name, input] of Object.entries(hostile)) {
    const started = process.hrtime.bigint();
    redact(input);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(ms < 1000, `${name} took ${Math.round(ms)} ms`);
  }
});
