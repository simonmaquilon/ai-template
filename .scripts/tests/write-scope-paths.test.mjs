import assert from 'node:assert/strict';
import { symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { commands } from '../shell-commands.mjs';
import { WINDOWS } from './support.mjs';
import { assertAsked, assertDenied, assertSilent, scope } from './write-scope-fixture.mjs';

const FILES = 'Write|Edit|NotebookEdit';
const write = (path) => ({ tool_name: 'Write', tool_input: { file_path: path, content: 'x' } });
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

test('a .. after a folder that does not exist resumes the real resolution, links included', { skip: WINDOWS }, (t) => {
  const { repo, tmp, outside, fire } = scope(t);
  symlinkSync(tmp, join(repo.dir, 'tmplink'));
  symlinkSync(outside, join(repo.dir, 'outlink'));
  assertDenied(fire('claude', FILES, write(`${repo.dir}/nope/../tmplink/x.txt`)), 'temp link behind ..');
  assertAsked(fire('claude', FILES, write(`${repo.dir}/nope/deeper/../../outlink/x.txt`)), 'outside link behind ..');
  assertAsked(fire('claude', FILES, write(`${repo.dir}/nope/../../x.txt`)), 'climbing out of the project');
  assertSilent(fire('claude', FILES, write(`${repo.dir}/nope/../kept.txt`)), 'back inside');
});

test('on POSIX a backslash belongs to the name, so it cannot climb out of a temporary folder', { skip: WINDOWS }, (t) => {
  const { repo, tmp, fire } = scope(t);
  const back = `a\\${'..\\'.repeat(20)}${repo.dir.slice(1).split('/').join('\\')}\\x.txt`;
  assertDenied(fire('claude', FILES, write(`${tmp}/${back}`)), 'backslashes');
});

test('a redirection that is the whole command keeps its target', (t) => {
  assert.deepEqual(commands('> "$TMPDIR/x"').map(({ targets }) => targets), [['$TMPDIR/x']]);
  assert.deepEqual(commands('>> a.txt; echo hi').map(({ targets }) => targets), [['a.txt'], []]);
  const { fire } = scope(t);
  for (const client of ['claude', 'codex']) assertDenied(fire(client, client === 'claude' ? 'Bash|PowerShell' : 'Bash', bash('> $TMPDIR/x')), client);
});

test('an internal error of the shell reader leaves shell commands alone and still asks for file tools', (t) => {
  const { repo, outside, fire } = scope(t);
  writeFileSync(join(repo.dir, '.scripts', 'shell-commands.mjs'), "export function commands() { throw new Error('other version'); }\n");
  assertSilent(fire('claude', 'Bash|PowerShell', bash('echo hi > $TMPDIR/x')), 'claude shell');
  assertSilent(fire('codex', 'Bash', bash('echo hi')), 'codex shell');
  assertAsked(fire('claude', FILES, write(join(outside, 'x.txt'))), 'file tool still asks');
});
