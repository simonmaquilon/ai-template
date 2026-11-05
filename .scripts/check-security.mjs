#!/usr/bin/env node
// Non-blocking, local security leads after edits (08-security-and-data.md).
// Scan only Git-visible files within this repository; omit ignored, generated,
// vendored, secret-store and binary files. Read only the lines that differ from
// HEAD, every line of an untracked file; each lead names its CWE and its OWASP
// Top 10:2025 category. Output no source or captured values.

import { spawnSync } from 'node:child_process';
import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { basename, extname, isAbsolute, relative, resolve } from 'node:path';
import { changedLines, enterRepositoryRoot, git, readHookInput, toPosix } from './hook-support.mjs';
import { securityLeads } from './security-patterns.mjs';

const MAX_BYTES = 1024 * 1024;
const MAX_LEADS = 20;
const FORMATS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.svelte', '.astro', '.html',
  '.py', '.sh', '.bash', '.zsh', '.rb', '.php', '.go', '.java', '.cs', '.rs', '.json', '.yaml', '.yml', '.toml']);
const RULE = '08-security-and-data.md';
function emitContext(message) {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message },
  }));
}
const input = await readHookInput();
const origin = typeof input.cwd === 'string' ? resolve(input.cwd) : process.cwd();
const root = enterRepositoryRoot();
if (!root) process.exit(0);
const tool = input.tool_input ?? {};
const rawPatch = tool.command ?? tool.input ?? tool.patch;
const patch = Array.isArray(rawPatch) ? rawPatch.join('\n') : typeof rawPatch === 'string' ? rawPatch : '';
const paths = typeof tool.file_path === 'string' ? [tool.file_path]
  : [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Move to): (.+)$/gm)].map((match) => match[1].trim());
if (paths.length === 0) process.exit(0);
let canonicalRoot;
try {
  canonicalRoot = realpathSync.native(root);
} catch {
  emitContext(`Security guidance (${RULE}): edit not scanned; repository path unavailable.`);
  process.exit(0);
}

const visible = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
const others = git(['ls-files', '--others', '--exclude-standard', '-z']);
if (visible === null || others === null) {
  emitContext(`Security guidance (${RULE}): edit not scanned; repository file inventory unavailable.`);
  process.exit(0);
}
const indexed = new Set(visible.split('\0').filter(Boolean));
const candidates = new Map();
for (const path of paths) {
  let full = null;
  let local;
  try {
    full = realpathSync.native(resolve(origin, path));
    local = toPosix(relative(canonicalRoot, full));
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) continue;
    local = toPosix(relative(root, resolve(origin, path)));
  }
  if (!local || local.startsWith('../') || isAbsolute(local)) continue;
  if (/^(?:\.git|\.ssh|\.aws|\.azure|\.gcloud)(?:\/|$)/i.test(local) || local === '.codex/auth.json') continue;
  if (/^(?:\.config\/gcloud|AppData\/Roaming\/gcloud)(?:\/|$)/i.test(local)) continue;
  if (!indexed.has(local) || !FORMATS.has(extname(local).toLowerCase()) || /^\.env(?:\.|$)/i.test(basename(local))) continue;
  candidates.set(local, full);
}
if (candidates.size === 0) process.exit(0);
const ignored = spawnSync('git', ['check-ignore', '--no-index', '-z', '--stdin'], {
  input: [...candidates.keys()].join('\0'), encoding: 'utf8', maxBuffer: 1024 * 1024,
});
if (ignored.status !== 0 && ignored.status !== 1) {
  emitContext(`Security guidance (${RULE}): edit not scanned; ignore rules unavailable.`);
  process.exit(0);
}
for (const path of ignored.stdout.split('\0')) candidates.delete(path);
if (candidates.size === 0) process.exit(0);
const attrs = git(['check-attr', '-z', '--stdin', 'linguist-generated', 'linguist-vendored'], [...candidates.keys()].join('\0'));
if (attrs === null) {
  emitContext(`Security guidance (${RULE}): edit not scanned; file attributes unavailable.`);
  process.exit(0);
}
const fields = attrs.split('\0');
for (let i = 0; i + 2 < fields.length; i += 3) {
  if (['set', 'true'].includes(fields[i + 2])) candidates.delete(fields[i]);
}

const untracked = new Set(others.split('\0').filter(Boolean));
const warnings = [];
for (const [local, full] of candidates) {
  const label = JSON.stringify(local);
  if (full === null) {
    warnings.push(`${label}: not scanned; file path unavailable. Review the task diff explicitly.`);
    continue;
  }
  let fd;
  try {
    fd = openSync(full, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0));
    const info = fstatSync(fd);
    if (!info.isFile()) continue;
    if (info.size > MAX_BYTES) {
      warnings.push(`${label}: not scanned; size limit exceeded. Review the task diff explicitly.`);
      continue;
    }
    const data = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < data.length) {
      const read = readSync(fd, data, length, data.length - length, null);
      if (read === 0) break;
      length += read;
    }
    if (length > MAX_BYTES) {
      warnings.push(`${label}: not scanned; size limit exceeded. Review the task diff explicitly.`);
      continue;
    }
    const bytes = data.subarray(0, length);
    if (bytes.includes(0)) continue;
    // One lead past the cap tells whether any was left out.
    const leads = securityLeads(bytes.toString('utf8'), changedLines(local, untracked), MAX_LEADS + 1);
    for (const lead of leads.slice(0, MAX_LEADS)) warnings.push(`${label}:${lead.line} [${lead.id}] ${lead.message}`);
    if (leads.length > MAX_LEADS) {
      warnings.push(`${label}: more than ${MAX_LEADS} candidates; only the first ${MAX_LEADS} are shown. Review this file's changes in the task diff.`);
    }
  } catch {
    warnings.push(`${label}: not scanned; file unavailable. Review the task diff explicitly.`);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
if (warnings.length > 0) {
  emitContext(`Security guidance (${RULE}): candidates require context; they are not confirmed vulnerabilities.\n${warnings.join('\n')}`);
}
