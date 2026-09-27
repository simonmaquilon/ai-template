// Helpers for the hook tests: throwaway git repositories under .temp/ carrying
// a copy of the repository's scripts, and a runner that starts each hook the
// way its agent client starts it on the current operating system.

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const WINDOWS = process.platform === 'win32';
const CONFIGS = { claude: '.claude/settings.json', codex: '.codex/hooks.json' };

export function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

export function numbered(count) {
  return Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
}

export function makeRepo(t) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.temp', 'hook-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  const scripts = join(ROOT, '.scripts');
  mkdirSync(join(dir, '.scripts'));
  for (const name of readdirSync(scripts)) {
    if (name.endsWith('.mjs')) cpSync(join(scripts, name), join(dir, '.scripts', name));
  }
  const identity = ['-c', 'user.name=Hook Test', '-c', 'user.email=hook-test@example.invalid', '-c', 'core.autocrlf=false'];
  const repo = {
    dir,
    git: (...args) => run('git', [...identity, ...args], { cwd: dir }),
    write(path, text) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    },
    script: (name, args = [], input) => run(process.execPath, [join('.scripts', name), ...args], { cwd: dir, input }),
  };
  repo.git('init', '-q');
  repo.write('.gitignore', '.temp/\n');
  return repo;
}

export function ruleHooks(client, event) {
  const hooks = JSON.parse(readFileSync(join(ROOT, CONFIGS[client]), 'utf8')).hooks[event] ?? [];
  return hooks.flatMap((group) => group.hooks).filter((hook) => !JSON.stringify(hook).includes('impeccable'));
}

export function hookFor(client, event, scriptName) {
  const hook = ruleHooks(client, event).find((candidate) => JSON.stringify(candidate).includes(scriptName));
  if (!hook) throw new Error(`${client} has no ${event} hook for ${scriptName}`);
  return hook;
}

// Claude Code spawns the exec form directly with the project directory
// substituted; Codex hands the command to cmd.exe /C on Windows and to a POSIX
// shell elsewhere, running it in the turn's working directory.
export function runClientHook(client, hook, repo, { cwd = repo.dir, input = {} } = {}) {
  const stdin = JSON.stringify(input);
  if (client === 'claude') {
    const args = hook.args.map((arg) => arg.replace('${CLAUDE_PROJECT_DIR}', repo.dir));
    return run(hook.command, args, { cwd, input: stdin });
  }
  if (WINDOWS) {
    const command = hook.commandWindows ?? hook.command;
    return run(process.env.ComSpec ?? 'cmd.exe', ['/C', `"${command}"`], { cwd, input: stdin, windowsVerbatimArguments: true });
  }
  return run('/bin/sh', ['-c', hook.command], { cwd, input: stdin });
}
