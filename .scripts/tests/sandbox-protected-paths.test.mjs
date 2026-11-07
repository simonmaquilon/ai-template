import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import test from 'node:test';
import { ROOT } from './support.mjs';

// Code the template runs outside the sandbox, or without asking, must sit under a sandbox.filesystem.denyWrite
// entry; otherwise a sandboxed command could rewrite it and the next hook, status line or exempt command would run it.
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const settings = JSON.parse(read('.claude/settings.json'));
const codexHooks = JSON.parse(read('.codex/hooks.json'));
const TOP = new Set(readdirSync(ROOT));
const clean = (path) => posix.normalize(path).replace(/^\.\//, '').replace(/\/+$/, '');

// Repository paths in a command line: tokens that start with a top-level entry of the repository, so that gh, git and
// node are ignored. The variables that name the root are removed and a trailing glob star is dropped.
function pathsIn(text) {
  return text.replaceAll('${CLAUDE_PROJECT_DIR}/', '').replaceAll('$r/', '').split(/[\s"'`;&|()]+/)
    .map((token) => clean(token.replace(/\*+$/, '')))
    .filter((token) => TOP.has(token.split('/')[0]));
}

const commands = [];
for (const group of Object.values(settings.hooks)) {
  for (const { hooks } of group) {
    for (const hook of hooks) commands.push(hook.command, ...(hook.args ?? []));
  }
}
for (const group of Object.values(codexHooks.hooks)) {
  for (const { hooks } of group) commands.push(...hooks.map((hook) => hook.command));
}
commands.push(settings.statusLine.command, ...settings.sandbox.excludedCommands);
for (const rule of settings.permissions.allow) {
  if (/^(Bash|PowerShell)\(/.test(rule)) commands.push(rule.slice(rule.indexOf('(') + 1, -1));
}

// The scripts those commands start, and the relative modules each one imports, however deep.
const found = new Set(commands.flatMap(pathsIn));
const queue = [...found].filter((path) => path.endsWith('.mjs'));
for (const script of queue) {
  for (const [, specifier] of read(script).matchAll(/(?:from\s+|import\()\s*'(\.{1,2}\/[^']+)'/g)) {
    const imported = posix.join(dirname(script), specifier);
    if (!found.has(imported)) {
      found.add(imported);
      queue.push(imported);
    }
  }
}
// The client hook configs, and what run-checks.mjs runs: the hook tests and the prompt-plan skill scripts.
for (const extra of ['.codex/hooks.json', '.codex/config.toml', '.scripts/tests', '.agents/skills/prompt-plan/scripts']) {
  found.add(extra);
}

const denied = (settings.sandbox.filesystem?.denyWrite ?? []).map(clean);
const covered = (path) => denied.some((entry) => path === entry || path.startsWith(`${entry}/`));

test('the paths the template runs code from are collected', () => {
  for (const path of ['.scripts/check-bulk-staging.mjs', '.scripts/status-line.mjs', '.scripts/run-checks.mjs', '.scripts/browser.mjs',
    '.scripts/hook-support.mjs', '.codex/hooks.json']) {
    assert.ok(found.has(path), `${path} is not collected`);
  }
});

test('every path run outside the sandbox or without asking is under sandbox.filesystem.denyWrite', () => {
  assert.deepEqual([...found].filter((path) => !covered(path)).sort(), []);
});

// The browser session runs outside the sandbox and keeps writing to its output folder after the launcher checked it,
// so a sandboxed command must not be able to write there or swap the folder, or its parents, for a link.
test('the output folder of the browser session is under sandbox.filesystem.denyWrite', () => {
  const { outputDir } = JSON.parse(read('.playwright/cli.config.json'));
  assert.ok(outputDir.startsWith('.temp/'), outputDir);
  assert.ok(covered(clean(outputDir)), `${outputDir} is not under denyWrite`);
});
