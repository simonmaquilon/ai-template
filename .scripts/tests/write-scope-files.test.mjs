import assert from 'node:assert/strict';
import { mkdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, WINDOWS } from './support.mjs';
import { assertAsked, assertDenied, assertSilent, scope } from './write-scope-fixture.mjs';

const MATCHER = 'Write|Edit|NotebookEdit';
const write = (path) => ({ tool_name: 'Write', tool_input: { file_path: path, content: 'x' } });
const encoded = (path) => path.replace(/[^A-Za-z0-9]/g, '-');
// A link to a folder that Windows creates without privileges, as a junction; null where the system refuses it.
function link(target, path) {
  try {
    symlinkSync(target, path, 'junction');
    return path;
  } catch {
    return null;
  }
}

test('claude: writes inside the project, new folders included, get no opinion from the write-scope hook', (t) => {
  const { repo, fire } = scope(t);
  assertSilent(fire('claude', MATCHER, write(join(repo.dir, 'kept.txt'))), 'existing file');
  assertSilent(fire('claude', MATCHER, write(join(repo.dir, 'new', 'deep', 'file.txt'))), 'missing folders');
  assertSilent(fire('claude', MATCHER, { tool_name: 'Edit', tool_input: { file_path: join(repo.dir, 'kept.txt'), old_string: 'a', new_string: 'b' } }), 'edit');
  assertSilent(fire('claude', MATCHER, { tool_name: 'NotebookEdit', tool_input: { notebook_path: join(repo.dir, 'n.ipynb'), new_source: 'x' } }), 'notebook');
  assertSilent(fire('claude', MATCHER, write(join(repo.dir, '.temp', 'scratch.txt'))), 'project .temp');
  const upper = repo.dir.toUpperCase();
  if (upper !== repo.dir && statSync(upper, { throwIfNoEntry: false })?.ino === statSync(repo.dir).ino) {
    assertSilent(fire('claude', MATCHER, write(join(upper, 'new.txt'))), 'other letter case');
  }
});

test('claude: writes in a system temporary folder are denied with a reason that names the project .temp/', (t) => {
  const { repo, tmp, fire } = scope(t);
  const reason = assertDenied(fire('claude', MATCHER, write(join(tmp, 'a', 'b.txt'))), 'TMPDIR');
  assert.ok(reason.includes(join(repo.dir, '.temp')), reason);
  assertDenied(fire('claude', MATCHER, write(join(tmp, 'x.txt'))), 'TMPDIR file');
  if (!WINDOWS && !ROOT.startsWith('/tmp/')) assertDenied(fire('claude', MATCHER, write('/tmp/write-scope-probe/x.txt')), '/tmp');
  const scratchpad = join(repo.dir, '..', 'not-a-temp-root');
  assertDenied(fire('claude', MATCHER, { ...write(join(scratchpad, 'notes.md')), scratchpad_dir: scratchpad }), 'scratchpad');
});

test('claude: writes anywhere else outside the project ask the user, also through .. and links', (t) => {
  const { repo, tmp, outside, fire } = scope(t);
  const reason = assertAsked(fire('claude', MATCHER, write(join(outside, 'x.txt'))), 'outside');
  assert.ok(reason.includes(JSON.stringify(join(outside, 'x.txt'))), reason);
  assert.doesNotMatch(assertAsked(fire('claude', MATCHER, write(join(outside, 'a\nAllow?'))), 'line break'), /\n/);
  assertAsked(fire('claude', MATCHER, write([repo.dir, '..', 'x.txt'].join(WINDOWS ? '\\' : '/'))), 'dot-dot');
  const out = link(outside, join(repo.dir, 'out'));
  const temp = link(tmp, join(repo.dir, 'temp'));
  if (out) assertAsked(fire('claude', MATCHER, write(join(out, 'x.txt'))), 'link to outside');
  if (temp) assertDenied(fire('claude', MATCHER, write(join(temp, 'new', 'x.txt'))), 'link to temp');
  // The system follows the link before it climbs, so this names a file beside the outside folder, not kept.txt.
  if (out) assertAsked(fire('claude', MATCHER, write([out, '..', 'kept.txt'].join(WINDOWS ? '\\' : '/'))), 'dot-dot after a link');
  try {
    symlinkSync(join(tmp, 'missing.txt'), join(repo.dir, 'dangling.txt'));
    assertDenied(fire('claude', MATCHER, write(join(repo.dir, 'dangling.txt'))), 'dangling link to temp');
  } catch (error) {
    if (!WINDOWS) throw error;
  }
});

test('claude: linked worktrees and declared additional directories count as inside', (t) => {
  const { repo, outside, fire } = scope(t);
  const tree = join(outside, 'tree');
  assert.equal(repo.git('worktree', 'add', '-q', tree).status, 0);
  assertSilent(fire('claude', MATCHER, write(join(tree, 'new.txt'))), 'worktree');
  assertSilent(fire('claude', MATCHER, write(join(tree, 'kept.txt')), tree), 'from inside the worktree');
  const declared = join(outside, 'declared');
  mkdirSync(declared);
  assertAsked(fire('claude', MATCHER, write(join(declared, 'x.txt'))), 'before declaring');
  repo.write('.claude/settings.local.json', JSON.stringify({ permissions: { additionalDirectories: [declared] } }));
  assertSilent(fire('claude', MATCHER, write(join(declared, 'x.txt'))), 'declared directory');
  assertAsked(fire('claude', MATCHER, write(join(outside, 'x.txt'))), 'beside the declared directory');
});

test('claude: the project auto memory and plan files stay writable; the rest of the configuration folder asks', (t) => {
  const { repo, config, fire } = scope(t);
  const memory = join(config, 'projects', encoded(repo.dir), 'memory');
  assertSilent(fire('claude', MATCHER, write(join(memory, 'MEMORY.md'))), 'memory index');
  assertAsked(fire('claude', MATCHER, write(join(memory, 'run.sh'))), 'memory non-Markdown');
  assertAsked(fire('claude', MATCHER, write(join(config, 'projects', 'other', 'memory', 'x.md'))), 'other project memory');
  assertSilent(fire('claude', MATCHER, write(join(config, 'plans', 'plan.md'))), 'plan file');
  assertAsked(fire('claude', MATCHER, write(join(config, 'settings.json'))), 'user settings');
  writeFileSync(join(config, 'settings.json'), JSON.stringify({ autoMemoryDirectory: join(config, 'mine') }));
  assertSilent(fire('claude', MATCHER, write(join(config, 'mine', 'note.md'))), 'user autoMemoryDirectory');
});

test('claude: an input the hook cannot read asks instead of allowing or failing', (t) => {
  const { fire } = scope(t);
  for (const [label, input] of [['not JSON', '{'], ['empty', '{}'], ['no path', { tool_name: 'Write', tool_input: {} }],
    ['path not text', { tool_name: 'Write', tool_input: { file_path: 7 } }], ['relative path', write('x.txt')]]) {
    assert.match(assertAsked(fire('claude', MATCHER, input), label), /could not tell/, label);
  }
});

test('codex: apply_patch into a temporary folder is denied; elsewhere Codex keeps its own approval', (t) => {
  const { repo, tmp, outside, fire } = scope(t);
  const patch = (header) => ({ tool_name: 'apply_patch', tool_input: { command: `*** Begin Patch\n${header}\n+x\n*** End Patch\n` } });
  assertDenied(fire('codex', 'apply_patch', patch(`*** Add File: ${join(tmp, 'x.txt')}`)), 'add in temp');
  assertDenied(fire('codex', 'apply_patch', patch(`*** Update File: kept.txt\n*** Move to: ${join(tmp, 'y.txt')}`)), 'move to temp');
  assertSilent(fire('codex', 'apply_patch', patch('*** Update File: kept.txt')), 'relative inside');
  assertSilent(fire('codex', 'apply_patch', patch(`*** Add File: ${join(outside, 'x.txt')}`)), 'outside');
  assertSilent(fire('codex', 'apply_patch', '{'), 'malformed');
  assertSilent(fire('codex', 'apply_patch', patch(`*** Delete File: ${join(repo.dir, 'kept.txt')}`)), 'delete inside');
});
