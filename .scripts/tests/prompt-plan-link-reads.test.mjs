// Where a folder is a link now, a path under it reads another file, one of the link's target, and is no file of the working
// tree. The snapshots, the checks before a write, and the list of untracked files that are gone count it as absent, so no
// file of the link's target stands in for it: not for an entry the earlier snapshot holds, nor for one the index marks
// skip-worktree, nor for the file whose bytes a clean filter might hide, nor for an untracked file of the before record.
// The other reads of a path under a link are in prompt-plan-link-folder.test.mjs.

import assert from 'node:assert/strict';
import { readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const skip = WINDOWS && 'symbolic links need privileges on Windows';

// A repository whose folder docs and folder site/docs hold a file of one name.
const FILES = { 'kept.txt': 'before\n', 'docs/x.md': 'docs\n', 'site/docs/x.md': 'site\n' };
// The folder docs replaced by a link to site/docs.
function linkDocs(repo) {
  rmSync(join(repo.dir, 'docs'), { recursive: true });
  symlinkSync('site/docs', join(repo.dir, 'docs'));
}
const recorded = (plan) => JSON.parse(readFileSync(join(plan, 'patch', '01.state'), 'utf8')).files;

// A file the before snapshot holds that stays on disk while the index no longer tracks it stops the record. A folder
// replaced by a staged link leaves its files out of the index, and through the link they seem to stay on disk, so they
// would stop it although the fragment replaced them.
test('prompt-plan link reads: record of a folder replaced by a staged link records the link although it leads to files of those names', { skip }, (t) => {
  const repo = startRepo(t, FILES);
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  linkDocs(repo);
  ok(repo.git('add', 'docs'));
  ok(patch('record', '01', 'after'));
  const files = recorded(plan);
  assert.deepEqual(Object.keys(files).sort(), ['docs', 'docs/x.md']);
  assert.match(files.docs.after, /^120000 /);
  assert.equal(files['docs/x.md'].after, null);
});

// An untracked file of the before record is gone when nothing stands at its path. Once its folder is a link, the path reads
// the link's target, where a file of that name stands, which is another file and must not hide that the user's is gone.
test('prompt-plan link reads: record after lists an untracked file as gone although its folder is a link that leads to a file of that name', { skip }, (t) => {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'docs/x.md': 'docs\n', 'site/docs/index.md': 'site\n' });
  const { patch } = patchPlan(repo, ['01']);
  repo.write('docs/index.md', 'mine\n');
  ok(patch('record', '01', 'before'));
  linkDocs(repo);
  const after = patch('record', '01', 'after', '--include', 'docs');
  ok(after);
  assert.match(after.stdout, /untracked at the before record[^\n]*gone now[^\n]*:\n {2}docs\/index\.md\n/);
  assert.equal(readFileSync(join(repo.dir, 'site', 'docs', 'index.md'), 'utf8'), 'site\n');
});

// git add skips a skip-worktree file, so its entry stays as the index holds it, as it does for a file that is not on disk;
// the snapshot clears the mark only for a file on disk, and a file under a link is none, or git add would find the entry
// removed and the snapshot would lose it.
test('prompt-plan link reads: a snapshot keeps the entry of a skip-worktree file although its folder is a link that leads to a file of that name', { skip }, (t) => {
  const repo = startRepo(t, FILES);
  const { plan, patch } = patchPlan(repo, ['01']);
  ok(repo.git('update-index', '--skip-worktree', 'docs/x.md'));
  linkDocs(repo);
  ok(patch('record', '01', 'before'));
  rmSync(join(repo.dir, 'docs'));
  repo.write('docs/x.md', 'mine\n');
  ok(repo.git('update-index', '--no-skip-worktree', 'docs/x.md'));
  ok(patch('record', '01', 'after'));
  assert.match(String(recorded(plan)['docs/x.md'].before), /^100644 /, 'the before snapshot lost the entry the index holds');
});

// The check that a clean filter hides no bytes reads files of the working tree only. With the entry kept above, a recorded
// file under a link fits the state apply expects, and the file it would read through the link, another one, must not be
// taken for it, or the refusal would name a filter, and advise moving a file aside that is the link target's.
test('prompt-plan link reads: apply refuses with git\'s reason, not a hiding filter, when the file lies under a link that leads to a file of that name', { skip }, (t) => {
  const repo = startRepo(t, {
    'kept.txt': 'before\n',
    '.gitattributes': '*.conf filter=redact\n',
    'docs/app.conf': 'password=REDACTED\nname=a\n',
    'site/docs/app.conf': 'password=hunter2\nname=a\n',
  });
  ok(repo.git('config', 'filter.redact.clean', "sed 's/^password=.*/password=REDACTED/'"));
  const { patch } = patchPlan(repo, ['01']);
  ok(patch('record', '01', 'before'));
  repo.write('docs/app.conf', 'password=REDACTED\nname=b\n');
  ok(patch('record', '01', 'after'));
  ok(patch('revert', '01'));
  ok(repo.git('update-index', '--skip-worktree', 'docs/app.conf'));
  linkDocs(repo);
  const applied = patch('apply', '01');
  assert.equal(applied.status, 1, `${applied.stdout}${applied.stderr}`);
  assert.match(applied.stderr, /its patch does not apply to the working tree/);
  assert.doesNotMatch(applied.stderr, /hides/);
  assert.equal(readFileSync(join(repo.dir, 'site', 'docs', 'app.conf'), 'utf8'), 'password=hunter2\nname=a\n');
});
