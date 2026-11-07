// The stack hook writes .docs/stack.md outside the sandbox, which a sandboxed command can write too: a link put in
// its place, or in place of .docs, must never redirect that read or write to another file.

import assert from 'node:assert/strict';
import { readFileSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, run } from './support.mjs';
import { fixture } from './stack-fixture.mjs';

const INPUT =JSON.stringify({ hook_event_name: 'UserPromptSubmit' });

// Runs the hook with `call` patched so that, once `when` accepts its arguments, .docs/stack.md is replaced by a link
// to a copy of itself, as a sandboxed command could do between the hook's check and its read or write.
function runSwapping(repo, call, when) {
  repo.write('.temp/swap.mjs', `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const original = fs.${call};
let fired = false;
fs.${call} = (path, ...rest) => {
  const result = ${call === 'lstatSync' ? 'original(path, ...rest)' : 'null'};
  if (!fired && String(path).replaceAll('\\\\', '/').endsWith('stack.md') && (${when})) {
    fired = true;
    fs.rmSync(${JSON.stringify(join(repo.dir, '.docs', 'stack.md'))});
    fs.symlinkSync(${JSON.stringify(join(repo.dir, 'victim.txt'))}, ${JSON.stringify(join(repo.dir, '.docs', 'stack.md'))});
  }
  return ${call === 'lstatSync' ? 'result' : 'original(path, ...rest)'};
};
syncBuiltinESMExports();
await import('../.scripts/update-stack-doc.mjs');
`);
  return run(process.execPath, ['.temp/swap.mjs', '--hook'], { cwd: repo.dir, input: INPUT });
}

test('a stack document that is a link is not written through', { skip: WINDOWS }, (t) => {
  const repo = fixture(t);
  const before = repo.stack();
  repo.write('victim.txt', before);
  rmSync(join(repo.dir, '.docs', 'stack.md'));
  symlinkSync(join(repo.dir, 'victim.txt'), join(repo.dir, '.docs', 'stack.md'));
  repo.sync({ hook_event_name: 'UserPromptSubmit' });
  assert.equal(readFileSync(join(repo.dir, 'victim.txt'), 'utf8'), before);
});

test('a stack document swapped for a link after the check is not read or written through', { skip: WINDOWS }, (t) => {
  const repo = fixture(t);
  const before = repo.stack();
  repo.write('victim.txt', before);
  const result = runSwapping(repo, 'lstatSync', 'true');
  assert.match(result.stdout, /not synced.*ELOOP/);
  assert.equal(readFileSync(join(repo.dir, 'victim.txt'), 'utf8'), before);
});

test('a stack document swapped for a link between the read and the write is not written through', { skip: WINDOWS }, (t) => {
  const repo = fixture(t);
  const before = repo.stack();
  repo.write('victim.txt', before);
  const result = runSwapping(repo, 'openSync', '(rest[0] & 3) === 1');
  assert.match(result.stdout, /not synced.*ELOOP/);
  assert.equal(readFileSync(join(repo.dir, 'victim.txt'), 'utf8'), before);
});

test('a .docs folder that is a link to another folder leaves that folder untouched', { skip: WINDOWS }, (t) => {
  const repo = fixture(t);
  const before = repo.stack();
  renameSync(join(repo.dir, '.docs'), join(repo.dir, 'elsewhere'));
  symlinkSync(join(repo.dir, 'elsewhere'), join(repo.dir, '.docs'), 'dir');
  repo.sync({ hook_event_name: 'UserPromptSubmit' });
  assert.equal(readFileSync(join(repo.dir, 'elsewhere', 'stack.md'), 'utf8'), before);
});
