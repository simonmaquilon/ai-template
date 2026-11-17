// Helpers for the derived-project tests: a project derived from the working tree as the start skill leaves it, and
// runners that start each registered hook as its client does, with the copy's scripts and registry.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, rmdirSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ADOPTION, MANIFEST, TEMPLATE_MARKERS, TEMPLATE_ONLY, listed } from '../template-files.mjs';
import { ROOT, WINDOWS, makeRepo, run } from './support.mjs';

export const read = (repo, path) => readFileSync(join(repo.dir, path), 'utf8');

// Files the working tree holds: tracked ones still on disk, and untracked ones no ignore rule hides.
function workingTreeFiles() {
  const listing = run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT });
  assert.equal(listing.status, 0, listing.stderr);
  return [...new Set(listing.stdout.split('\0').filter(Boolean))].filter((path) => lstatSync(join(ROOT, path), { throwIfNoEntry: false }));
}

function copy(repo, path) {
  const source = join(ROOT, path);
  const target = join(repo.dir, path);
  mkdirSync(dirname(target), { recursive: true });
  rmSync(target, { force: true });
  if (lstatSync(source).isSymbolicLink()) symlinkSync(readlinkSync(source), target);
  else cpSync(source, target);
}

function git(repo, ...args) {
  const result = repo.git(...args);
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
}

// A derived project: the working tree without the template-only files, committed once, with a manifest the copy's own
// template-manifest.mjs wrote while the copy still held the template's CI markers and origin, and no origin after.
export function derivedProject(t) {
  const repo = makeRepo(t);
  rmSync(join(repo.dir, '.scripts'), { recursive: true, force: true });
  const carried = (path) => path !== MANIFEST && (!listed(TEMPLATE_ONLY, path) || TEMPLATE_MARKERS.includes(path));
  for (const path of workingTreeFiles().filter(carried)) copy(repo, path);
  const recorded = /cuyo remoto `origin` apunta a `([^`]+)`/.exec(read(repo, ADOPTION))?.[1];
  assert.ok(recorded, `${ADOPTION} records the template's origin`);
  git(repo, 'remote', 'add', 'origin', recorded);
  const commit = (message) => ['add -A', 'add -f -- .temp/.gitignore', `commit -q -m ${message}`].forEach((step) => git(repo, ...step.split(' ')));
  commit('template');
  const written = repo.script('template-manifest.mjs', ['--write']);
  assert.equal(written.status, 0, written.stderr);
  for (const path of TEMPLATE_MARKERS) {
    rmSync(join(repo.dir, path), { force: true });
    for (let dir = dirname(path); dir !== '.'; dir = dirname(dir)) if (!rmEmpty(join(repo.dir, dir))) break;
  }
  git(repo, 'remote', 'remove', 'origin');
  git(repo, 'update-ref', '-d', 'HEAD');
  commit('adopt');
  return repo;
}

// Removes a folder git would not have left behind once its last file is gone; false when it still holds something.
const rmEmpty = (dir) => { try { rmdirSync(dir); return true; } catch { return false; } };

// The registered hooks of one client for an event, from the copy's own registry, as { matcher, hook, script }.
export function registered(repo, client, event) {
  const file = client === 'claude' ? '.claude/settings.json' : '.codex/hooks.json';
  const groups = JSON.parse(read(repo, file)).hooks[event] ?? [];
  const script = (hook) => /\.scripts\/([\w.-]+\.mjs)/.exec(JSON.stringify(hook))?.[1];
  return groups.flatMap((group) => group.hooks.map((hook) => ({ matcher: group.matcher ?? null, hook, script: script(hook) })));
}

// Registered hooks whose matcher covers a tool, or every one for an event without matchers.
export const forTool = (repo, client, event, tool) =>
  registered(repo, client, event).filter(({ matcher }) => matcher === null || matcher.split('|').includes(tool));

// The environment a client gives its hooks: the project folder, and a configuration and temporary folder of their own.
export function hookEnv(t, repo, client) {
  const dir = mkdtempSync(join(ROOT, '.temp', 'hook-derived-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  const own = realpathSync.native(dir);
  const env = { ...process.env, TMPDIR: own, TMP: own, TEMP: own, CLAUDE_CONFIG_DIR: own };
  for (const name of ['CLAUDE_PROJECT_DIR', 'CLAUDE_CODE_TMPDIR', 'CLAUDE_CODE_PROJECT_DIR_NAME']) delete env[name];
  return client === 'claude' ? { ...env, CLAUDE_PROJECT_DIR: repo.dir } : env;
}

// How a client starts a hook: Claude Code spawns its exec form, Codex hands its command to a shell in the turn's folder.
function command(client, hook, repo) {
  if (client === 'claude') return [hook.command, hook.args.map((arg) => arg.replace('${CLAUDE_PROJECT_DIR}', repo.dir))];
  if (WINDOWS) return [process.env.ComSpec ?? 'cmd.exe', ['/C', `"${hook.commandWindows ?? hook.command}"`]];
  return ['/bin/sh', ['-c', hook.command]];
}

// Starts a hook and settles with { status, stdout, stderr } once it ends; the input goes in as JSON on stdin.
export function start(client, { hook }, repo, env, input) {
  const [file, args] = command(client, hook, repo);
  return new Promise((resolve) => {
    const child = spawn(file, args, { cwd: repo.dir, env, windowsVerbatimArguments: WINDOWS && client === 'codex' });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(JSON.stringify({ cwd: repo.dir, session_id: 'derived-1', ...input }));
  });
}

export const events = {
  prompt: { hook_event_name: 'UserPromptSubmit', prompt: 'go' },
  stop: { hook_event_name: 'Stop', stop_hook_active: false },
  agentStart: { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'general-purpose' },
  agentStop: { hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'general-purpose', stop_hook_active: false },
};

// What a hook decided: 'silent', 'context' (text for the model), 'deny', 'ask', 'block', 'reject' (Codex and the staging
// guard exit with status 2), or a description of whatever else it did.
export function verdict({ status: code, stdout, stderr }) {
  if (code === 2) return 'reject';
  if (code !== 0) return `exit ${code}: ${stderr}`;
  if (stderr !== '') return `stderr: ${stderr}`;
  if (stdout === '') return 'silent';
  try {
    const { hookSpecificOutput: specific, decision } = JSON.parse(stdout);
    return specific?.permissionDecision ?? decision ?? (specific?.additionalContext ? 'context' : `unknown: ${stdout}`);
  } catch {
    return `text: ${stdout}`;
  }
}

// The call a client makes to a tool: a shell command, or the write or edit of a file, which Codex makes with apply_patch.
export function toolCall(repo, client, kind, text, path = '') {
  if (kind === 'shell') return { tool_name: 'Bash', tool_input: { command: text } };
  const patch = kind === 'write' ? `*** Add File: ${path}\n+${text}\n` : `*** Update File: ${path}\n@@\n-${text}\n+${text} x\n`;
  if (client === 'codex') return { tool_name: 'apply_patch', tool_input: { command: `*** Begin Patch\n${patch}*** End Patch\n` } };
  const file_path = join(repo.dir, path);
  return kind === 'write' ? { tool_name: 'Write', tool_input: { file_path, content: text } }
    : { tool_name: 'Edit', tool_input: { file_path, old_string: text, new_string: `${text} x` } };
}

// Starts, one after another, the hooks a client registers for an event and tool; each result adds its script and verdict.
export async function fire(repo, client, env, event, call) {
  const input = { hook_event_name: event, tool_use_id: 'u1', ...call, ...(event === 'PostToolUse' ? { tool_response: {} } : {}) };
  const results = [];
  for (const hook of forTool(repo, client, event, call.tool_name)) {
    const result = await start(client, hook, repo, env, input);
    results.push({ script: hook.script, verdict: verdict(result), ...result });
  }
  assert.ok(results.length > 0, `${client} registers ${event} hooks for ${call.tool_name}`);
  return results;
}

export const status = (repo) => repo.git('status', '--porcelain', '--untracked-files=all').stdout.split('\n').filter(Boolean);
