// Helpers for the template-seal tests: a throwaway derived project whose manifest the maintained template wrote before
// the project took its own origin, holding sealed, project-owned, executable, and linked template files, and runners
// for the seal hook at the prompt and the write guard before a file tool.

import assert from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { ONLY, cli, commit, template } from './template-manifest-fixture.mjs';
import { ROOT, WINDOWS, hookFor, run, runClientHook } from './support.mjs';
import { scopeHook } from './write-scope-fixture.mjs';

export const DRIFT = '.temp/template-drift';
export const MARKER = '.temp/template-adoption';
export const EXCEPTIONS = '.agents/template-exceptions.json';
export const DERIVED = 'https://example.invalid/owner/derived.git';
export const FILES = {
  'AGENTS.md': '# AGENTS.md\n',
  '.agents/instructions/01-meta-guidelines.md': '# Meta\n',
  '.agents/instructions/02-change-workflow.md': '# Change\n',
  '.agents/skills/start/SKILL.md': '# Start\n',
  '.agents/skills/security-audit/check.cjs': 'console.log(1);\n',
  '.docs/plan.md': '# Plan\n',
  'README.md': '# Readme\n',
};

// A derived project: every file committed, the manifest written while origin was the template's, then origin moved
// and the template-only files deleted, as the start skill deletes them. With release, refs/plantilla/1.0.0 names the
// release commit, as the adoption guide fetches it.
export function derived(t, { manifest = (files) => files, release = false } = {}) {
  const repo = template(t);
  for (const [path, text] of Object.entries(FILES)) repo.write(path, text);
  for (const path of ['.claude/settings.json', '.codex/hooks.json']) repo.write(path, readFileSync(join(ROOT, path), 'utf8'));
  if (!WINDOWS) {
    chmodSync(join(repo.dir, '.agents/skills/security-audit/check.cjs'), 0o755);
    symlinkSync('../.agents/skills', join(repo.dir, '.claude/skills'));
  }
  commit(repo);
  assert.equal(cli(repo, '--write').status, 0);
  const path = join(repo.dir, '.agents/template-manifest.json');
  const written = JSON.parse(readFileSync(path, 'utf8'));
  repo.write('.agents/template-manifest.json', `${JSON.stringify({ ...written, files: manifest(written.files) }, null, 2)}\n`);
  commit(repo);
  if (release) repo.git('update-ref', 'refs/plantilla/1.0.0', 'HEAD');
  repo.git('rm', '-q', '--', ...ONLY);
  commit(repo);
  repo.git('remote', 'set-url', 'origin', DERIVED);
  return repo;
}

// Points refs/plantilla/1.0.0 at a release whose tree is HEAD's with these regular files set to these blob ids, which
// need not exist, as in a partial clone that never fetched them.
export function releaseWith(repo, files) {
  const env = { ...process.env, GIT_INDEX_FILE: join(repo.dir, '.git', 'release-index') };
  const git = (...args) => run('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args], { cwd: repo.dir, env }).stdout.trim();
  git('read-tree', 'HEAD');
  for (const [path, id] of Object.entries(files)) git('update-index', '--add', '--cacheinfo', `100644,${id},${path}`);
  const tree = git('write-tree', '--missing-ok');
  repo.git('update-ref', 'refs/plantilla/1.0.0', git('commit-tree', tree, '-m', 'release'));
}

export const read = (repo, path) => readFileSync(join(repo.dir, path), 'utf8');
export const exists = (repo, path) => existsSync(join(repo.dir, path));

// The seal hook as a client starts it at a prompt.
export function seal(repo, client = 'claude') {
  const hook = hookFor(client, 'UserPromptSubmit', 'check-template-seal.mjs');
  const result = runClientHook(client, hook, repo, { input: { hook_event_name: 'UserPromptSubmit', cwd: repo.dir, prompt: 'go' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return result.stdout;
}

// The copies the seal saved, as "<UTC folder>/<path>" in sorted order.
export function copies(repo) {
  const dir = join(repo.dir, DRIFT);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1).split('\\').join('/'))
    .sort();
}

// The decision the write guard printed before a file tool, as [decision, reason], or null when it stayed silent.
export function guard(repo, client, input) {
  const shell = input.tool_name === 'Bash';
  const hook = scopeHook(client, shell ? (client === 'claude' ? 'Bash|PowerShell' : 'Bash') : client === 'claude' ? 'Write|Edit|NotebookEdit' : 'apply_patch');
  const result = runClientHook(client, hook, repo, { input: { cwd: repo.dir, hook_event_name: 'PreToolUse', ...input } });
  assert.equal(result.status, 0, result.stderr);
  if (result.stdout === '') return null;
  const { permissionDecision, permissionDecisionReason } = JSON.parse(result.stdout).hookSpecificOutput;
  return [permissionDecision, permissionDecisionReason];
}
