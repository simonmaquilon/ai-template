// Helpers for the hook tests: throwaway git repositories under .temp/ carrying
// a copy of the repository's scripts, and a runner that starts each hook the
// way its agent client starts it on the current operating system.

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const WINDOWS = process.platform === 'win32';

// Every process the tests start inherits this: git started under .temp/ stops
// looking for a repository there instead of reaching this one.
process.env.GIT_CEILING_DIRECTORIES = join(ROOT, '.temp');
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
  const init = repo.git('init', '-q');
  if (init.status !== 0) throw new Error(`git init failed in ${dir}: ${init.stderr.trim()}`);
  // Saved in the repository too, so scripts that run their own git, such as prompt-plan's, keep LF line endings even
  // when the system configuration sets core.autocrlf=true, as Git for Windows does by default.
  repo.git('config', 'core.autocrlf', 'false');
  repo.write('.gitignore', '.temp/\n');
  return repo;
}

// A throwaway repository whose first commit holds the given files.
export function startRepo(t, files = { 'kept.txt': 'before\n' }) {
  const repo = makeRepo(t);
  for (const [path, text] of Object.entries(files)) repo.write(path, text);
  for (const args of [['add', '-A'], ['commit', '-q', '-m', 'start']]) {
    const result = repo.git(...args);
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return repo;
}

// A plan, by default in the repository's ignored .temp/plans/p, with prompt-plan's patch scripts copied as the skill
// copies them and one build file per fragment number; patch(script, ...args) runs one from the repository root with
// env added.
export function patchPlan(repo, numbers, env = {}, folder = join('.temp', 'plans', 'p')) {
  const plan = join(repo.dir, folder);
  for (const dir of ['build', 'patch']) mkdirSync(join(plan, dir), { recursive: true });
  const bundled = join(ROOT, '.agents', 'skills', 'prompt-plan', 'scripts', 'node');
  for (const name of ['common', 'record', 'apply', 'revert']) cpSync(join(bundled, `${name}.mjs`), join(plan, 'patch', `${name}.mjs`));
  for (const number of numbers) writeFileSync(join(plan, 'build', `${number}-step.md`), `# ${number}\n`);
  const patch = (script, ...args) => run(process.execPath, [join(plan, 'patch', `${script}.mjs`), ...args],
    { cwd: repo.dir, env: { ...process.env, ...env } });
  return { plan, patch };
}

// Whether any patch or state of a plan, or any object of the plan or of the repository, holds text.
export function holds(repo, plan, text) {
  const records = readdirSync(join(plan, 'patch')).filter((name) => /\.(patch|state)$/.test(name));
  if (records.some((name) => readFileSync(join(plan, 'patch', name), 'utf8').includes(text.trim()))) return true;
  const blob = run('git', ['hash-object', '--stdin'], { cwd: repo.dir, input: text }).stdout.trim();
  const stored = (env) => run('git', ['cat-file', '-e', blob], { cwd: repo.dir, env: { ...process.env, ...env } }).status === 0;
  return stored({ GIT_OBJECT_DIRECTORY: join(plan, 'patch', 'objects') }) || stored({});
}

export function ruleHooks(client, event) {
  const hooks = JSON.parse(readFileSync(join(ROOT, CONFIGS[client]), 'utf8')).hooks[event] ?? [];
  return hooks.flatMap((group) => group.hooks);
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
