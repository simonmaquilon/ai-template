import assert from 'node:assert/strict';
import { chmodSync, lstatSync, readlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { commit } from './template-manifest-fixture.mjs';
import { WINDOWS } from './support.mjs';
import { DRIFT, FILES, derived, exists, read, seal } from './template-seal-fixture.mjs';

const MANIFEST = '.agents/template-manifest.json';
const blob = (repo, path) => repo.git('rev-parse', `HEAD:${path}`).stdout.trim();

// Commits a manifest that names more files than the release shipped, as an edit to the committed manifest would.
function tamper(repo, extra) {
  const manifest = JSON.parse(read(repo, MANIFEST));
  repo.write(MANIFEST, `${JSON.stringify({ ...manifest, files: { ...manifest.files, ...extra } }, null, 2)}\n`);
  commit(repo);
}

test('a committed manifest never makes the seal create a file git does not track or ignores', (t) => {
  const repo = derived(t);
  const id = blob(repo, 'AGENTS.md');
  tamper(repo, { '.claude/settings.local.json': id, '.envrc': id, '.temp/hooks.json': id });
  const message = seal(repo);
  for (const path of ['.claude/settings.local.json', '.envrc', '.temp/hooks.json']) {
    const reason = 'the commit that recorded \\.agents/template-manifest\\.json does not hold it with that content';
    assert.match(message, new RegExp(`^- ${path.replace(/\./g, '\\.')}: deleted; not restored: ${reason}`, 'm'), path);
    assert.equal(exists(repo, path), false, path);
  }
});

test('with the adopted release fetched, only its files with its content are restored', (t) => {
  const repo = derived(t, { release: true });
  repo.write('src/app.js', 'project code\n');
  commit(repo);
  tamper(repo, { 'src/app.js': blob(repo, 'AGENTS.md') });
  repo.write('AGENTS.md', 'edited\n');
  const message = seal(repo);
  assert.match(message, /^- src\/app\.js: content changed; not restored: refs\/plantilla\/1\.0\.0 does not ship it with that content$/m);
  assert.equal(read(repo, 'src/app.js'), 'project code\n');
  assert.match(message, /^- AGENTS\.md: content changed; restored/m);
  assert.equal(read(repo, 'AGENTS.md'), FILES['AGENTS.md']);
});

test('without index entries, the link and the executable bit come from the committed tree', { skip: WINDOWS }, (t) => {
  const repo = derived(t);
  const script = '.agents/skills/security-audit/check.cjs';
  repo.git('rm', '-q', '--cached', '--', '.claude/skills', script);
  rmSync(join(repo.dir, '.claude/skills'));
  repo.write('.claude/skills', 'not a link\n');
  chmodSync(join(repo.dir, script), 0o644);
  const message = seal(repo);
  assert.match(message, /^- \.claude\/skills: the symbolic link was replaced by a file; restored/m);
  assert.match(message, /^- \.agents\/skills\/security-audit\/check\.cjs: executable bit changed; restored/m);
  assert.equal(readlinkSync(join(repo.dir, '.claude/skills')), '../.agents/skills');
  assert.equal(lstatSync(join(repo.dir, script)).mode & 0o100, 0o100);
});

test('with core.fileMode false, the executable bit is no drift', { skip: WINDOWS }, (t) => {
  const repo = derived(t);
  repo.git('config', 'core.fileMode', 'false');
  chmodSync(join(repo.dir, 'AGENTS.md'), 0o755);
  chmodSync(join(repo.dir, '.agents/skills/security-audit/check.cjs'), 0o644);
  assert.equal(seal(repo), '');
});

test('when the changed version cannot be saved, the file is not restored', (t) => {
  const repo = derived(t);
  repo.write(DRIFT, 'a file where the copies folder goes\n');
  repo.write('AGENTS.md', 'edited\n');
  assert.match(seal(repo), /^- AGENTS\.md: content changed; not restored/m);
  assert.equal(read(repo, 'AGENTS.md'), 'edited\n');
  assert.equal(read(repo, DRIFT), 'a file where the copies folder goes\n');
});
