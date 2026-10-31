// What prompt-plan's patch scripts do when a lossy filter driver reaches git through the environment's GIT_CONFIG_PARAMETERS,
// which git -c fills, as Claude Code's sandboxed shell does, and which git reads after the GIT_CONFIG_COUNT settings that
// switch a driver off. The scripts append those settings to GIT_CONFIG_PARAMETERS itself, in git's quoting, so that the
// driver is off in the comparison that shows what it hides, whatever its name holds, and they refuse to overwrite the
// hidden bytes.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const refused = (result, pattern) => {
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, pattern);
  assert.doesNotMatch(result.stderr, /^\s+at /m, 'the refusal carries a stack trace');
};
const HIDES = /filter[\s\S]*hides[\s\S]*overwrite[\s\S]*\n {2}app\.conf$/m;
// Quoted for a POSIX shell, and for an entry of GIT_CONFIG_PARAMETERS, which quotes alike, also an exclamation mark.
const quoted = (text) => `'${text.replaceAll("'", "'\\''").replaceAll('!', "'\\!'")}'`;

// A long-running filter for git's process protocol, version 2: it redacts the password on the way in and keeps every
// byte on the way out.
const FILTER = `import { readSync, writeSync } from 'node:fs';
const read = (size) => {
  const buffer = Buffer.alloc(size);
  for (let got = 0; got < size;) {
    const count = readSync(0, buffer, got, size - got, null);
    if (count === 0) process.exit(0);
    got += count;
  }
  return buffer;
};
const packet = () => {
  const length = parseInt(read(4).toString(), 16);
  return length === 0 ? null : read(length - 4);
};
const send = (text) => writeSync(1, text === null ? '0000' : (4 + Buffer.byteLength(text)).toString(16).padStart(4, '0') + text);
const list = () => {
  const lines = [];
  for (let line = packet(); line !== null; line = packet()) lines.push(line.toString().trim());
  return lines;
};
list();
['git-filter-server\\n', 'version=2\\n', null].forEach(send);
list();
['capability=clean\\n', 'capability=smudge\\n', null].forEach(send);
for (;;) {
  const command = list().find((line) => line.startsWith('command='));
  const chunks = [];
  for (let chunk = packet(); chunk !== null; chunk = packet()) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString();
  const output = command === 'command=clean' ? text.replace(/^password=.*/gm, 'password=REDACTED') : text;
  ['status=success\\n', null, ...(output ? [output] : []), null, null].forEach(send);
}
`;

const NAMED = [['', 'redact'], [', named with an equals sign', 'a=b'], [', named with a line separator', 'a\u2028b'], [', named with a quote and a bang', "it's!"]];
for (const [label, driver] of NAMED) {
  test(`prompt-plan process: restore refuses a file whose lossy process filter the environment sets as a git -c setting${label}`, { skip: WINDOWS && 'the filter command is quoted for a POSIX shell' }, (t) => {
    const repo = startRepo(t, { 'kept.txt': 'before\n', 'app.conf': 'password=REDACTED\nname=a\n', '.gitattributes': `app.conf filter=${driver}\n` });
    repo.write(join('.temp', 'redact.mjs'), FILTER);
    const command = `${quoted(process.execPath)} ${quoted(join(repo.dir, '.temp', 'redact.mjs'))}`;
    const { patch } = patchPlan(repo, ['01'], { GIT_CONFIG_PARAMETERS: `${quoted('http.proxyAuthMethod=basic')} ${quoted(`filter.${driver}.process`)}=${quoted(command)}` });
    repo.write('app.conf', 'password=hunter2\nname=a\n');
    ok(patch('record', '01', 'before'));
    repo.write('app.conf', 'password=hunter2\nname=b\n');
    refused(patch('record', '01', 'restore'), HIDES);
    assert.equal(readFileSync(join(repo.dir, 'app.conf'), 'utf8'), 'password=hunter2\nname=b\n');
  });
}
