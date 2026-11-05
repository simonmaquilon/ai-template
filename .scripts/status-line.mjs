#!/usr/bin/env node
// The Claude Code status line: one line built from the JSON the client sends on stdin, segments joined by " | ":
//
//   folder [branch] | model | effort | cx <context used>% | cc <cache minutes>min | <five-hour used>% <time to reset>
//
// A segment whose data is absent or null is omitted, with its separator. The branch shows only inside a git
// repository (the short commit id on a detached HEAD). Registered in .readme/92-agent-hooks.md. Exit status: always
// 0, since a failing status line command blanks the line.

import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readHookInput } from './hook-support.mjs';

// The family and version of a model id, whatever prefix or suffix surrounds it: claude-opus-5-5, claude-sonnet-4-20250514.
const MODEL = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?!\d)/;

const isNumber = (value) => typeof value === 'number';
const dirOf = (input) => input.workspace?.current_dir || input.cwd || process.cwd();
const folderOf = (dir) => dir.split(/[\\/]/).filter(Boolean).pop() ?? '';

function gitOutput(dir, args) {
  const run = spawnSync('git', ['--no-optional-locks', '-C', dir, ...args], { encoding: 'utf8', timeout: 1000, windowsHide: true });
  return run.status === 0 ? run.stdout.trim() : null;
}

// The branch the directory is on, the short commit id on a detached HEAD, or null outside git or when git fails.
export function branchOf(dir) {
  const name = gitOutput(dir, ['branch', '--show-current']);
  return name === null ? null : name || gitOutput(dir, ['rev-parse', '--short', 'HEAD']) || null;
}

function modelOf({ id, display_name: name }) {
  const [, family, major, minor] = MODEL.exec(id ?? '') ?? [];
  return family ? `${family} ${major}${minor ? `.${minor}` : ''}` : String(name ?? '').toLowerCase();
}

function cacheOf(cache, now) {
  if (!cache || cache.caching_observed === false) return null;
  const warm = cache.warm && cache.expires_at != null;
  return `cc ${warm ? Math.max(0, Math.floor((cache.expires_at * 1000 - now) / 60000)) : 0}min`;
}

function limitOf(limit, now) {
  if (!isNumber(limit?.used_percentage)) return null;
  const used = `${Math.round(limit.used_percentage)}%`;
  if (!isNumber(limit.resets_at)) return used;
  const minutes = Math.floor(Math.max(0, limit.resets_at * 1000 - now) / 60000);
  const hours = Math.floor(minutes / 60);
  return `${used} ${hours > 0 ? `${hours}h${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`}`;
}

// The line for a status line payload at a time in milliseconds, with the branch of its directory, or null for none.
export function render(input, { now, branch }) {
  const used = input.context_window?.used_percentage;
  return [
    [folderOf(dirOf(input)), branch && `[${branch}]`].filter(Boolean).join(' '),
    modelOf(input.model ?? {}),
    input.effort?.level,
    isNumber(used) && `cx ${Math.round(used)}%`,
    cacheOf(input.prompt_cache, now),
    limitOf(input.rate_limits?.five_hour, now),
  ].filter(Boolean).join(' | ');
}

async function main() {
  const input = (await readHookInput()) ?? {};
  console.log(render(input, { now: Date.now(), branch: branchOf(dirOf(input)) }));
}

// Runs only when started as a script, so that importing render does not run it.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main();
