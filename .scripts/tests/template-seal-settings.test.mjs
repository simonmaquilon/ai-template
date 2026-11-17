import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { PROJECT_OWNED, listed } from '../template-files.mjs';
import { commit } from './template-manifest-fixture.mjs';
import { DRIFT, EXCEPTIONS, MARKER, copies, derived, guard, read, seal } from './template-seal-fixture.mjs';

// .claude/settings.json is a sealed template file in a derived project; the project's own settings go in
// .claude/settings.local.json, which Claude Code merges above it, and a project that must change the shared file records
// it in the exceptions list.
const SETTINGS = '.claude/settings.json';
const LOCAL = '.claude/settings.local.json';
const MANIFEST = '.agents/template-manifest.json';
const write = (repo, path) => ({ tool_name: 'Write', tool_input: { file_path: join(repo.dir, path), content: 'x' } });
const edit = (repo, change) => {
  const settings = JSON.parse(read(repo, SETTINGS));
  change(settings);
  const text = `${JSON.stringify(settings, null, 2)}\n`;
  repo.write(SETTINGS, text);
  return text;
};
const without = (settings) => {
  settings.hooks.UserPromptSubmit[0].hooks = settings.hooks.UserPromptSubmit[0].hooks.filter((hook) => !hook.args[0].includes('check-doc-links.mjs'));
  settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter((group) => group.matcher !== 'Write|Edit|NotebookEdit');
};
const allowed = (settings) => settings.permissions.allow.push('Bash(rm -rf *)');

test('the settings file is no longer project-owned, and the rest of the project-owned list is unchanged', () => {
  assert.equal(listed(PROJECT_OWNED, SETTINGS), false);
  assert.deepEqual(PROJECT_OWNED, ['.docs/', 'README.md', '.codex/config.toml', '.mcp.json', '.readme/91-agent-sandbox.md',
    '.readme/95-agent-tool-servers.md', '.gitignore', '.gitattributes', 'skills-lock.json', '.agents/tool-versions.json']);
});

test('the manifest still lists the settings file, and --compare classifies it as any sealed file', (t) => {
  const repo = derived(t);
  assert.ok(Object.hasOwn(JSON.parse(read(repo, MANIFEST)).files, SETTINGS));
  const original = read(repo, SETTINGS);
  repo.git('checkout', '-q', '-b', 'release');
  edit(repo, (settings) => { settings.permissions.allow.push('Bash(node .scripts/new.mjs)'); });
  const manifest = JSON.parse(read(repo, MANIFEST));
  manifest.files[SETTINGS] = repo.git('hash-object', SETTINGS).stdout.trim();
  repo.write(MANIFEST, `${JSON.stringify({ ...manifest, version: '1.1.0' }, null, 2)}\n`);
  commit(repo);
  repo.git('checkout', '-q', '-');
  assert.equal(read(repo, SETTINGS), original);
  assert.match(repo.script('template-manifest.mjs', ['--compare', 'release']).stdout, /^take \.claude\/settings\.json$/m);
  repo.write(SETTINGS, `${original}\n`);
  assert.match(repo.script('template-manifest.mjs', ['--compare', 'release']).stdout, /^merge \.claude\/settings\.json$/m);
});

test('a changed, extended, or deleted settings file is restored from its blob, the changed version saved, and the agent told', (t) => {
  for (const release of [false, true]) {
    for (const change of [without, allowed, null]) {
      const repo = derived(t, { release });
      const shipped = read(repo, SETTINGS);
      repo.write(LOCAL, '{ "permissions": { "allow": ["Bash(ls)"] } }\n');
      const changed = change ? edit(repo, change) : null;
      if (!change) rmSync(join(repo.dir, SETTINGS));
      const message = seal(repo);
      const label = `release ${release}, ${change?.name ?? 'deleted'}`;
      assert.match(message, new RegExp(`^- \\.claude/settings\\.json: ${change ? 'content changed' : 'deleted'}; restored`, 'm'), label);
      assert.equal(read(repo, SETTINGS), shipped, label);
      assert.doesNotMatch(message, /no longer registers/, label);
      assert.equal(read(repo, LOCAL), '{ "permissions": { "allow": ["Bash(ls)"] } }\n', 'the local settings are the project\'s');
      if (change) {
        const [saved] = copies(repo);
        assert.ok(message.includes(`${DRIFT}/${saved.split('/')[0]}/`), message);
        assert.equal(read(repo, `${DRIFT}/${saved}`), changed, label);
        assert.equal(saved.slice(saved.indexOf('/') + 1), SETTINGS);
      } else assert.deepEqual(copies(repo), [], label);
      assert.equal(seal(repo), '', label);
    }
  }
});

test('file tools may not edit the settings file, but may edit the local one, an excepted one, and any during an adoption', (t) => {
  const repo = derived(t);
  assert.equal(guard(repo, 'claude', write(repo, SETTINGS))?.[0], 'deny');
  assert.equal(guard(repo, 'claude', write(repo, LOCAL)), null);
  repo.write(EXCEPTIONS, JSON.stringify({ [SETTINGS]: 'Adds the project hook, see .agents/instructions/20-own.md' }));
  assert.equal(guard(repo, 'claude', write(repo, SETTINGS)), null);
  rmSync(join(repo.dir, EXCEPTIONS));
  repo.write(MARKER, 'now\n');
  assert.equal(guard(repo, 'claude', write(repo, SETTINGS)), null);
});

test('an excepted settings file is not restored, and the template hooks it no longer registers are reported', (t) => {
  for (const entry of [SETTINGS, '.claude/']) {
    const repo = derived(t);
    repo.write(EXCEPTIONS, JSON.stringify({ [entry]: 'Own hooks, see .agents/instructions/20-own.md' }));
    const text = edit(repo, without);
    const message = seal(repo);
    assert.match(message, /\.claude\/settings\.json is excepted in .*no longer registers these template hooks/s, entry);
    assert.match(message, /UserPromptSubmit check-doc-links\.mjs/, entry);
    assert.match(message, /PreToolUse \(Write\|Edit\|NotebookEdit\) check-write-scope\.mjs/, entry);
    assert.match(message, /\.agents\/template-exceptions\.json, so the seal does not restore it/, entry);
    assert.equal(read(repo, SETTINGS), text, entry);
    assert.deepEqual(copies(repo), [], entry);
    repo.write(EXCEPTIONS, JSON.stringify({ [entry]: 'Own hooks', '.scripts/check-doc-links.mjs': 'Links in CI', '.scripts/check-write-scope.mjs': 'Own guard' }));
    assert.equal(seal(repo), '', 'a hook whose script the list names is not required');
    repo.write(SETTINGS, '{ not json');
    assert.match(seal(repo), /cannot read \.claude\/settings\.json/, entry);
  }
});

test('during an adoption the settings file is neither restored nor accepted by --adoption-end while it differs', (t) => {
  const repo = derived(t);
  repo.write(MARKER, '2026-11-12T10:00:00Z\n');
  const text = edit(repo, allowed);
  assert.match(seal(repo), /template adoption is in progress/);
  assert.equal(read(repo, SETTINGS), text);
  const refused = repo.script('check-template-seal.mjs', ['--adoption-end']);
  assert.equal(refused.status, 1);
  assert.match(refused.stdout, /^- \.claude\/settings\.json: content changed$/m);
});

test('the template and its copies never seal the settings file', (t) => {
  const repo = derived(t);
  repo.write('.readme/94-template-ci.md', 'only validates the template\n');
  commit(repo);
  const text = edit(repo, allowed);
  assert.equal(seal(repo), '');
  assert.equal(read(repo, SETTINGS), text);
  assert.equal(guard(repo, 'claude', write(repo, SETTINGS)), null);
});
