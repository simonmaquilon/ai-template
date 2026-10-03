import assert from 'node:assert/strict';
import test from 'node:test';
import { makeRepo, run } from './support.mjs';
import { postToolContext } from './hook-context.mjs';

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
  assert.match(postToolContext(result), /blocked\.js.*not scanned/);
  assert.doesNotMatch(result.stdout, /eval\(input\)/);
});

test('security guidance reports an unresolvable repository root as model context', (t) => {
  const repo = makeRepo(t);
  repo.write('sample.js', 'eval(input);\n');
  repo.write('.temp/deny-root.mjs', `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
fs.realpathSync.native = (path) => {
  const error = new Error('Synthetic denied root');
  error.code = 'EACCES';
  throw error;
};
syncBuiltinESMExports();
await import('../.scripts/check-security.mjs');
`);
  const scan = (toolInput) => run(process.execPath, ['.temp/deny-root.mjs'], {
    cwd: repo.dir, input: JSON.stringify({ cwd: repo.dir, hook_event_name: 'PostToolUse', tool_input: toolInput }),
  });
  assert.match(postToolContext(scan({ file_path: 'sample.js' })), /edit not scanned; repository path unavailable/);
  assert.equal(postToolContext(scan({})), '');
});

test('security guidance reports eligible read failures without leaking source', (t) => {
  const repo = makeRepo(t);
  repo.write('blocked.js', 'eval(input);\n');
  repo.write('.temp/deny-open.mjs', `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const original = fs.openSync;
fs.openSync = (path, ...rest) => {
  if (String(path).endsWith('blocked.js')) {
    const error = new Error('Synthetic denied read');
    error.code = 'EACCES';
    throw error;
  }
  return original(path, ...rest);
};
syncBuiltinESMExports();
await import('../.scripts/check-security.mjs');
`);
  const input = JSON.stringify({ cwd: repo.dir, hook_event_name: 'PostToolUse', tool_input: { file_path: 'blocked.js' } });
  const result = run(process.execPath, ['.temp/deny-open.mjs'], { cwd: repo.dir, input });
  assert.match(postToolContext(result), /blocked\.js.*not scanned; file unavailable/);
  assert.doesNotMatch(result.stdout, /eval\(input\)|Synthetic denied/);
});

const GIT_GAPS = { 'ls-files': 'file inventory', 'check-ignore': 'ignore rules', 'check-attr': 'file attributes' };
for (const [subcommand, gap] of Object.entries(GIT_GAPS)) {
  test(`security guidance delivers ${subcommand} failures as non-blocking model context`, (t) => {
    const repo = makeRepo(t);
    repo.write('sample.js', 'eval(input);\n');
    repo.write('.temp/deny-git.mjs', `
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const original = cp.spawnSync;
cp.spawnSync = (command, args, options) => {
  if (command === 'git' && args[0] === '${subcommand}') return { status: 2, stdout: '', stderr: 'Synthetic failure' };
  return original(command, args, options);
};
syncBuiltinESMExports();
await import('../.scripts/check-security.mjs');
`);
    const input = JSON.stringify({ cwd: repo.dir, hook_event_name: 'PostToolUse', tool_input: { file_path: 'sample.js' } });
    const result = run(process.execPath, ['.temp/deny-git.mjs'], { cwd: repo.dir, input });
    assert.match(postToolContext(result), new RegExp(`edit not scanned; (?:repository )?${gap} unavailable`));
    assert.doesNotMatch(result.stdout, /eval\(input\)/);
  });
}
