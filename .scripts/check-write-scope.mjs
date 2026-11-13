#!/usr/bin/env node
// Enforces where agents write files (03-code-authoring.md) before a tool call runs. For a file tool (Claude Code's
// Write, Edit, and NotebookEdit, which name the file in tool_input.file_path or notebook_path, and Codex's apply_patch,
// whose patch names each file it adds, updates, deletes, or moves to), write-scope.mjs judges every target: a write
// into a system temporary folder or the session scratchpad is denied with a reason that points to the project's
// .temp/; one outside the project, its linked worktrees, its declared directories, and the client's own memory and
// plan files asks for the user's confirmation; any other gets no opinion and follows the client's permission flow,
// except where template-seal.mjs guards it under the seal of 01-meta-guidelines.md in a derived project: a sealed
// template file is denied, since the change belongs in the template or the exceptions list, and the exceptions list
// or the adoption marker, which pause or narrow the seal, ask, or are denied where the client cannot ask outside an
// adoption. For a shell command, write-scope-shell.mjs denies the evident writes into a temporary folder, the hook
// treats a redirection or tee into the list or the marker as a file tool's write, and stays silent about the rest,
// which the sandbox confines, and about its own errors. Both decisions are one JSON object on stdout, which Claude
// Code and Codex read. Whatever the hook cannot read or resolve for a file tool, its own errors included, asks instead
// of allowing or failing. Codex cannot ask, so its hooks pass --no-ask, which turns every other ask into silence and
// leaves the write to Codex's own sandbox and approvals; with --powershell, which the Codex hook passes on Windows, a
// command is read both ways. Without it, a Bash command on Windows is read as Git Bash runs it for Claude Code, with
// the temporary folder at /tmp and each drive at /<letter>.

import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHookInput, toPosix } from './hook-support.mjs';
import { sealGuard } from './template-seal.mjs';
import { realTarget, within, writeScope } from './write-scope.mjs';
import { fromGitBash, shellTempWrite, shellWrites } from './write-scope-shell.mjs';

const RULE = '03-code-authoring.md';
const SEAL_RULE = '01-meta-guidelines.md';
const SHELLS = new Set(['Bash', 'PowerShell', 'Monitor']);
const PATCH_HEADER = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm;
const project = dirname(dirname(fileURLToPath(import.meta.url)));
const input = await readHookInput();
const cwd = typeof input?.cwd === 'string' && isAbsolute(input.cwd) ? input.cwd : process.cwd();

const ADVICE = `keep temporary files in the project's .temp/ folder (${join(project, '.temp')}) instead.`;
const UNRESOLVED = 'the write-scope guard could not tell where this write lands; writing outside the project needs the '
  + 'user\'s approval.';
// A path as JSON text, so a line break or another control character in it cannot reshape the message.
const shown = (path) => JSON.stringify(path);

// The paths a file tool names, or null when the input does not name them as absolute paths a patch may make relative.
function targets(name, tool) {
  if (name === 'apply_patch') {
    const patch = typeof tool?.command === 'string' ? tool.command : '';
    const paths = [...patch.matchAll(PATCH_HEADER)].map((match) => match[1].trim());
    return paths.length > 0 ? paths.map((path) => (isAbsolute(path) ? path : `${cwd}${sep}${path}`)) : null;
  }
  const path = tool?.file_path ?? tool?.notebook_path;
  return typeof path === 'string' && isAbsolute(path) ? [path] : null;
}

// The target the template seal guards, as [path from the project root, 'sealed', 'control', or 'control-adopting'], a
// sealed one first, or undefined.
function sealGuarded(paths) {
  const root = realTarget(project);
  const inside = paths.map(realTarget).filter((path) => within(root, path)).map((path) => toPosix(relative(root, path)));
  if (inside.length === 0) return undefined;
  process.chdir(project);
  const guarded = inside.map((path) => [path, sealGuard(path)]).filter(([, kind]) => kind);
  return guarded.find(([, kind]) => kind === 'sealed') ?? guarded[0];
}

// The decision for a write to the exceptions list or the adoption marker: ask, or, where the client cannot ask, deny,
// except during an adoption, whose procedure records the exceptions there.
function control(path, kind) {
  const noAsk = process.argv.includes('--no-ask');
  if (noAsk && kind === 'control-adopting') return null;
  return [noAsk ? 'deny' : 'ask', `${shown(path)} pauses, narrows, or turns off the template seal of this derived project, which only `
    + `the user decides: ${noAsk ? 'ask the user to make this change' : 'allow it only if the user asked for it'} `
    + '(.readme/96-template-adoption.md).', SEAL_RULE];
}

// The decision for this call as [decision, reason, rule], or null for no opinion; the rule defaults to RULE.
function decide(name, tool) {
  const scope = () => writeScope({ project, scratchpad: input?.scratchpad_dir });
  if (SHELLS.has(name)) {
    if (typeof tool?.command !== 'string' && !Array.isArray(tool?.command)) return null;
    const readings = name === 'PowerShell' ? [true] : process.argv.includes('--powershell') ? [true, false] : [false];
    const gitBash = process.platform === 'win32' && readings.length === 1 && !readings[0];
    let judge;
    // Its own error says nothing about where a command writes, which the sandbox confines anyway, so it stays silent.
    try {
      const isTemp = (path) => (judge ??= scope())(path) === 'temp';
      const found = shellTempWrite(tool.command, { readings, cwd, isTemp, gitBash });
      if (found) return ['deny', `this command writes into a system temporary folder (${shown(found)}); ${ADVICE}`];
      const named = shellWrites(tool.command, { readings }).filter((word) => word && !/[$%]/.test(word))
        .map((word) => (gitBash ? fromGitBash(word) : word)).map((word) => (isAbsolute(word) ? word : `${cwd}${sep}${word}`));
      const [guarded, kind] = named.length > 0 ? sealGuarded(named) ?? [] : [];
      return kind?.startsWith('control') ? control(guarded, kind) : null;
    } catch {
      return null;
    }
  }
  const paths = targets(name, tool);
  if (!paths) return ['ask', UNRESOLVED];
  const judge = scope();
  const kinds = paths.map((path) => [path, judge(path)]);
  const temp = kinds.find(([, kind]) => kind === 'temp');
  if (temp) return ['deny', `${shown(temp[0])} is in a system temporary folder; ${ADVICE}`];
  const [guarded, kind] = sealGuarded(paths) ?? [];
  if (kind === 'sealed') {
    return ['deny', `${shown(guarded)} is a sealed template file in this derived project: change it in the template repository `
      + 'and adopt the release, or, with the user\'s approval, record it in .agents/template-exceptions.json as the project\'s '
      + 'own (.readme/96-template-adoption.md).', SEAL_RULE];
  }
  const decision = kind?.startsWith('control') ? control(guarded, kind) : null;
  if (decision) return decision;
  const outside = kinds.find(([, kind]) => kind === 'outside');
  return outside ? ['ask', `${shown(outside[0])} is outside the project, its linked worktrees, and the directories its settings `
    + 'declare; writing there needs the user\'s approval.'] : null;
}

let result;
try {
  result = decide(input?.tool_name, input?.tool_input);
} catch {
  result = ['ask', UNRESOLVED];
}
if (result && !(result[0] === 'ask' && process.argv.includes('--no-ask'))) {
  const [permissionDecision, reason, rule = RULE] = result;
  const output = { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason: `${rule}: ${reason}` };
  console.log(JSON.stringify({ hookSpecificOutput: output }));
}
