import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { postToolContext } from './hook-context.mjs';
import { WINDOWS, makeRepo, run } from './support.mjs';

// A newline is not allowed in a file name on Windows.
const NAME = 'bad\nname.md';
const STAR = 'Unordered list style [Expected: dash; Actual: asterisk]';
const lint = (repo, ...args) => run(process.execPath, [join(repo.dir, '.scripts', 'check-markdown.mjs'), ...args], { cwd: repo.dir });
// DEL, a C1 control (8-bit CSI), a line separator and two direction controls are valid in a file name on every system.
const ODD = `a\u007fb\u009bc\u2028d${String.fromCodePoint(0x202e)}${String.fromCodePoint(0x2066)}e.md`;

test('markdown manual mode: a file name with a line break cannot split a stdout or stderr report line', { skip: WINDOWS }, (t) => {
  const repo = makeRepo(t);
  repo.write(NAME, '* a\n* b\n');
  const warned = lint(repo, NAME);
  assert.deepEqual([warned.status, warned.stdout, warned.stderr],
    [1, `bad\\nname.md:1 [MD004] ${STAR}\nbad\\nname.md:2 [MD004] ${STAR}\n`, '']);
  const missing = lint(repo, 'gone\nname.md');
  assert.deepEqual([missing.status, missing.stdout, missing.stderr], [2, '', 'gone\\nname.md: not checked; ENOENT\n']);
});

test('markdown --all: a Git-listed file name with a line break cannot split a stdout report line', { skip: WINDOWS }, (t) => {
  const repo = makeRepo(t);
  repo.write(NAME, '* a\n');
  const result = lint(repo, '--all');
  assert.deepEqual([result.status, result.stdout, result.stderr], [1, `bad\\nname.md:1 [MD004] ${STAR}\n`, '']);
});

test('markdown check: DEL, C1 controls, line separators and direction controls in a file name are escaped in manual and hook mode', (t) => {
  const repo = makeRepo(t);
  repo.write(ODD, '* a\n');
  const line = `a\\u007fb\\u009bc\\u2028d\\u202e\\u2066e.md:1 [MD004] ${STAR}`;
  const manual = lint(repo, ODD);
  assert.deepEqual([manual.status, manual.stdout, manual.stderr], [1, `${line}\n`, '']);
  const input = JSON.stringify({ cwd: repo.dir, hook_event_name: 'PostToolUse', tool_input: { file_path: ODD } });
  const hook = run(process.execPath, [join(repo.dir, '.scripts', 'check-markdown.mjs'), '--hook'], { cwd: repo.dir, input });
  assert.equal(postToolContext(hook).split('\n').slice(1).join('\n'), line);
});
