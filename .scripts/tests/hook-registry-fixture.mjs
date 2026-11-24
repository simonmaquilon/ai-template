// Helpers for the hook registry tests: the hooks of the Claude Code and Codex files read as lists of { event, script,
// matcher, flags }, and the explicit map from a Claude Code matcher to the Codex one it corresponds to.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './support.mjs';

export const read = (path) => readFileSync(join(ROOT, path), 'utf8');
export const hooksOf = (file) => JSON.parse(read(file)).hooks;

// The script a command line runs, whatever shell form wraps its path: exactly one per hook.
export function scriptOf(command) {
  const names = [...new Set(String(command).match(/[\w-]+\.mjs/g))];
  assert.equal(names.length, 1, `one script expected in: ${command}`);
  return names[0];
}

// Events only Claude Code has, with the scripts it registers for each: Codex has no PostToolUseFailure, and its
// PostToolUse already runs for a Bash command that exits with an error.
export const CLAUDE_ONLY = { PostToolUseFailure: ['check-protected-paths.mjs'] };

// Scripts only Claude Code registers inside an event both clients have: Codex has no list of sandbox exemptions, and its
// hook documentation does not list its question tool (request_user_input) among the tools PostToolUse covers, so the
// receipt of an answered question (check-plan-stop.mjs --question) has no Codex entry.
export const CLAUDE_ONLY_SCRIPTS = { PreToolUse: ['check-exempt-command.mjs'], PostToolUse: ['check-plan-stop.mjs'] };
export const claudeOnly = (event, script) => event in CLAUDE_ONLY || (CLAUDE_ONLY_SCRIPTS[event] ?? []).includes(script);

// The tools of a matcher, in order, so that a reordered matcher is the same one and no matcher is no tools.
export const tools = (matcher) => String(matcher ?? '').split('|').filter(Boolean).sort().join('|');

// The Codex matcher each Claude Code matcher corresponds to: Claude Code's shell is Bash, PowerShell, and Monitor, which
// runs a command in the Bash shell, against Codex's Bash, and its file tools are apply_patch in Codex.
const CODEX_OF = new Map(Object.entries({
  'Bash|PowerShell|Monitor': 'Bash', 'Bash|Monitor': 'Bash', 'Write|Edit|NotebookEdit': 'apply_patch', 'Edit|Write': 'Edit|Write|apply_patch',
  'Edit|Write|Bash|PowerShell': 'Edit|Write|apply_patch|Bash', '': '', AskUserQuestion: 'AskUserQuestion',
}).map(([claudeSide, codexSide]) => [tools(claudeSide), tools(codexSide)]));

// Every hook of a client as { event, script, matcher, flags } plus, for Codex, the flags of its commandWindows form.
export function hookList(hooks, isClaude) {
  const flagsOf = (command, pattern) => {
    const match = pattern.exec(command);
    assert.ok(match, `unreadable hook command: ${command}`);
    return (match[1] ?? '').split(/\s+/).filter(Boolean);
  };
  return Object.entries(hooks).flatMap(([event, groups]) => groups.flatMap((group) => group.hooks.map((hook) => ({
    event, script: scriptOf(isClaude ? hook.args[0] : hook.command), matcher: tools(group.matcher),
    flags: isClaude ? hook.args.slice(1) : flagsOf(hook.command, /node "\$r\/\.scripts\/[\w-]+\.mjs"(?: (.*))?$/),
    windows: isClaude ? undefined : flagsOf(hook.commandWindows, /pathToFileURL\(s\)\)"(?: -- (.*))?$/),
  }))));
}

// A Claude Code hook with its matcher replaced by the Codex one it corresponds to, or by "unmapped ..." when none does.
export const mapped = (hook) => ({ ...hook, matcher: CODEX_OF.get(hook.matcher) ?? `unmapped ${hook.matcher}` });
export const key = ({ event, script, matcher }) => `${event} ${script} ${matcher}`;
