// Edges of what prompt-plan's records leave out: an ignored file renamed during the fragment is a new untracked file,
// which --leave covers and whose old name after lists as gone, and a link is no more captured than a file; an untracked
// file the before record holds is no gone one, since the patch records its deletion; an ignored file that git add stages
// is tracked, and git captures what it tracks whatever the ignore rules say; a tracked file moved into an ignored folder,
// or replaced by an ignored folder or link, is recorded as deleted.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, holds, patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const state = (plan, number) => JSON.parse(readFileSync(join(plan, 'patch', `${number}.state`), 'utf8'));
const SECRET = 'TOKEN=secret-value\n';

function setUp(t, files = {}, numbers = ['01']) {
  const repo = startRepo(t, { 'kept.txt': 'before\n', '.gitignore': '.temp/\n.env\n*.link\n', ...files });
  return { repo, at: (path) => join(repo.dir, path), ...patchPlan(repo, numbers) };
}

test('prompt-plan ignore: an ignored file renamed during the fragment is a new untracked file, which --leave keeps out', (t) => {
  const { repo, at, plan, patch } = setUp(t);
  repo.write('.env', SECRET);
  ok(patch('record', '01', 'before'));
  renameSync(at('.env'), at('config.env'));
  repo.write('kept.txt', 'after\n');
  const refused = patch('record', '01', 'after');
  assert.equal(refused.status, 1, `${refused.stdout}${refused.stderr}`);
  assert.match(refused.stderr, /config\.env/);
  ok(patch('record', '01', 'after', '--leave', 'config.env'));
  assert.deepEqual(Object.keys(state(plan, '01').files), ['kept.txt']);
  ok(patch('revert', '01'));
  assert.equal(readFileSync(at('config.env'), 'utf8'), SECRET, 'revert deleted the renamed file');
  assert.equal(holds(repo, plan, SECRET), false);
});

test('prompt-plan ignore: an untracked file the fragment moves is listed as gone, by its own name', (t) => {
  const { repo, at, patch } = setUp(t);
  repo.write('.env', SECRET);
  repo.write('deps/pkg/a.js', 'a\n');
  ok(patch('record', '01', 'before'));
  mkdirSync(at('config'));
  renameSync(at('.env'), at('config/local.env'));
  rmSync(at('deps'), { recursive: true });
  const after = patch('record', '01', 'after', '--leave', 'config');
  ok(after);
  // Each file by its own name, sorted; the file moved to config/local.env is still there, so it is no entry.
  assert.match(after.stdout, /untracked at the before record[^\n]*gone now[^\n]*no patch[^\n]*revert[^\n]*:\n {2}\.env\n {2}deps\/pkg\/a\.js\n/);
  assert.doesNotMatch(after.stdout, /local\.env/);
});

test('prompt-plan ignore: a file an earlier fragment adopted and this one renames is no gone file, and revert brings it back', (t) => {
  const { repo, at, patch } = setUp(t, {}, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('gen.sh', 'gen\n');
  ok(patch('record', '01', 'after', '--include', 'gen.sh'));
  ok(patch('record', '02', 'before'));
  renameSync(at('gen.sh'), at('build.sh'));
  const after = patch('record', '02', 'after', '--include', 'build.sh');
  ok(after);
  // The before tree holds gen.sh, so the patch records its deletion and revert can bring it back.
  assert.doesNotMatch(after.stdout, /gone now|gen\.sh/);
  ok(patch('revert', '02'));
  assert.deepEqual([readFileSync(at('gen.sh'), 'utf8'), existsSync(at('build.sh'))], ['gen\n', false]);
});

test('prompt-plan ignore: a file git rm --cached took out of the index waits for git add, and is then no gone file', (t) => {
  const { repo, at, patch } = setUp(t, { 'extra.txt': 'extra\n' }, ['01', '02']);
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'after\n');
  ok(patch('record', '01', 'after'));
  ok(repo.git('rm', '--cached', '-q', 'extra.txt'));
  const refused = patch('record', '02', 'before');
  assert.equal(refused.status, 1, `${refused.stdout}${refused.stderr}`);
  assert.match(refused.stderr, /the index no longer tracks these files of fragment 01's after record, which stay on disk[^\n]*:\n {2}extra\.txt/);
  ok(repo.git('add', 'extra.txt'));
  ok(patch('record', '02', 'before'));
  renameSync(at('extra.txt'), at('moved.txt'));
  const after = patch('record', '02', 'after', '--include', 'moved.txt');
  ok(after);
  assert.doesNotMatch(after.stdout, /gone now|extra\.txt/);
  ok(patch('revert', '02'));
  assert.deepEqual([readFileSync(at('extra.txt'), 'utf8'), existsSync(at('moved.txt'))], ['extra\n', false]);
});

test('prompt-plan ignore: a link, ignored or not, is captured only once adopted', { skip: WINDOWS && 'symbolic links need privileges on Windows' }, (t) => {
  const { repo, at, plan, patch } = setUp(t);
  repo.write('.env', SECRET);
  ok(patch('record', '01', 'before'));
  symlinkSync('.env', at('secret.link'));
  symlinkSync('.env', at('alias'));
  ok(patch('record', '01', 'after', '--leave', 'alias'));
  assert.deepEqual(Object.keys(state(plan, '01').files), []);
  assert.equal(holds(repo, plan, '.env'), false, 'a link to the secret was stored');
  ok(patch('revert', '01'));
  assert.equal(existsSync(at('secret.link')) && existsSync(at('alias')), true);
});

test('prompt-plan ignore: an ignored file that git add stages is tracked, so a record captures it, as git does', (t) => {
  const { repo, at, plan, patch } = setUp(t);
  repo.write('.env', 'TOKEN=first\n');
  ok(repo.git('add', '-f', '.env'));
  ok(patch('record', '01', 'before'));
  repo.write('.env', 'TOKEN=second\n');
  repo.write('new.secret', 'created-secret\n');
  repo.write('.gitignore', '.temp/\n.env\n*.link\n*.secret\n');
  ok(repo.git('add', '-f', 'new.secret'));
  ok(patch('record', '01', 'after'));
  assert.deepEqual(Object.keys(state(plan, '01').files).sort(), ['.env', '.gitignore', 'new.secret']);
  assert.match(readFileSync(join(plan, 'patch', '01.patch'), 'utf8'), /TOKEN=second[\s\S]*created-secret/);
  ok(patch('revert', '01'));
  assert.equal(readFileSync(at('.env'), 'utf8'), 'TOKEN=first\n');
  assert.equal(existsSync(at('new.secret')), false);
  ok(patch('apply', '01'));
  assert.equal(readFileSync(at('.env'), 'utf8'), 'TOKEN=second\n');
});

test('prompt-plan ignore: a tracked file moved into an ignored folder is recorded as deleted, and revert puts it back', (t) => {
  const { repo, at, plan, patch } = setUp(t, { '.gitignore': '.temp/\nout/\n', 'lib/x.js': 'x\n' });
  repo.write('out/gen.txt', 'gen\n');
  ok(patch('record', '01', 'before'));
  renameSync(at('lib'), at('out/lib'));
  ok(patch('record', '01', 'after'));
  assert.deepEqual(Object.keys(state(plan, '01').files), ['lib/x.js']);
  ok(patch('revert', '01'));
  assert.deepEqual([existsSync(at('lib/x.js')), existsSync(at('out/lib/x.js'))], [true, true]);
  ok(patch('apply', '01'));
  assert.deepEqual([existsSync(at('lib/x.js')), existsSync(at('out/lib/x.js'))], [false, true]);
});

test('prompt-plan ignore: a file replaced by an ignored folder, and a folder by an ignored link, are recorded as deleted', { skip: WINDOWS && 'symbolic links need privileges on Windows' }, (t) => {
  const { repo, at, plan, patch } = setUp(t, { build: 'file\n', 'a/f.txt': 'f\n' });
  ok(patch('record', '01', 'before'));
  repo.write('.gitignore', '.temp/\nbuild/\na\ntarget/\n');
  rmSync(at('build'));
  repo.write('build/out.txt', 'out\n');
  rmSync(at('a'), { recursive: true });
  repo.write('target/f.txt', 'f\n');
  symlinkSync('target', at('a'));
  ok(patch('record', '01', 'after'));
  assert.deepEqual([state(plan, '01').files.build.after, state(plan, '01').files['a/f.txt'].after], [null, null]);
});
