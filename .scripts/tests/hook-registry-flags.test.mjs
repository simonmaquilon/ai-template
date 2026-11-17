import assert from 'node:assert/strict';
import test from 'node:test';
import { hookList, hooksOf, key, mapped, tools } from './hook-registry-fixture.mjs';

// The flags of the script each hook runs, keyed "event script matcher" with the matcher as Codex names it: `own` are the
// script's, passed by both clients; `codex` are the ones only Codex adds, since it cannot ask and its hooks reject or
// stay silent; `win` marks the Codex hooks whose commandWindows also pass --powershell, since its Bash tool may run
// the command through PowerShell on Windows. A hook not listed has no flags.
const row = (event, script, matcher, spec) => [`${event} ${script} ${tools(matcher)}`, spec];
const FLAGS = new Map([
  row('PreToolUse', 'check-bulk-staging.mjs', 'Bash', { own: ['--hook'], win: true }),
  row('PreToolUse', 'check-destructive-push.mjs', 'Bash', { own: ['--hook'], codex: ['--deny'], win: true }),
  row('PreToolUse', 'check-write-scope.mjs', 'Bash', { codex: ['--no-ask'], win: true }),
  row('PreToolUse', 'check-write-scope.mjs', 'apply_patch', { codex: ['--no-ask'] }),
  row('PreToolUse', 'check-protected-paths.mjs', 'Bash', { codex: ['--deny'], win: true }),
  row('PreToolUse', 'check-nul-redirect.mjs', 'Bash', { win: true }),
  row('UserPromptSubmit', 'update-stack-doc.mjs', '', { own: ['--hook'] }),
  row('UserPromptSubmit', 'check-file-length.mjs', '', { own: ['--hook', '--turn-start'] }),
  row('UserPromptSubmit', 'check-plan-stop.mjs', '', { own: ['--turn-start'] }),
  row('PostToolUse', 'check-file-length.mjs', 'Edit|Write|apply_patch', { own: ['--hook'] }),
  row('PostToolUse', 'check-markdown.mjs', 'Edit|Write|apply_patch', { own: ['--hook'] }),
  row('PostToolUse', 'update-stack-doc.mjs', 'Edit|Write|apply_patch|Bash', { own: ['--hook'] }),
  row('PostToolUse', 'check-protected-paths.mjs', 'Bash', { own: ['--after'] }),
  row('PostToolUseFailure', 'check-protected-paths.mjs', 'Bash', { own: ['--after'] }),
  row('Stop', 'check-file-length.mjs', '', { own: ['--hook'] }),
  row('SubagentStart', 'check-plan-stop.mjs', '', { own: ['--agent-start'] }),
]);

// What differs from the table, one line each.
function flagProblems(claudeHooks, codexHooks) {
  const problems = [];
  const used = new Set();
  const same = (label, actual, wanted) => {
    if (JSON.stringify([...actual].sort()) !== JSON.stringify([...wanted].sort())) problems.push(`${label}: ${actual} instead of ${wanted}`);
  };
  for (const hook of hookList(claudeHooks, true).map(mapped)) {
    used.add(key(hook));
    same(`claude ${key(hook)}`, hook.flags, FLAGS.get(key(hook))?.own ?? []);
  }
  for (const hook of hookList(codexHooks, false)) {
    const { own = [], codex = [], win = false } = FLAGS.get(key(hook)) ?? {};
    used.add(key(hook));
    same(`codex command ${key(hook)}`, hook.flags, [...own, ...codex]);
    same(`codex commandWindows ${key(hook)}`, hook.windows, [...own, ...codex, ...(win ? ['--powershell'] : [])]);
  }
  for (const line of FLAGS.keys()) if (!used.has(line)) problems.push(`no hook for ${line}`);
  return problems;
}

test('each script gets the flags of the table in both clients, and Codex commandWindows adds --powershell where it does today', () => {
  assert.deepEqual(flagProblems(hooksOf('.claude/settings.json'), hooksOf('.codex/hooks.json')), []);
});

test('a flag that differs between the clients, or a lost --powershell, fails the table', () => {
  const claudeHooks = hooksOf('.claude/settings.json');
  claudeHooks.PreToolUse[0].hooks[1].args.push('--deny');
  assert.equal(flagProblems(claudeHooks, hooksOf('.codex/hooks.json')).length, 1);
  const codexHooks = hooksOf('.codex/hooks.json');
  const [first, , third] = codexHooks.PreToolUse[0].hooks;
  first.commandWindows = first.commandWindows.replace(' --powershell', '');
  third.command = third.command.replace(' --no-ask', '');
  assert.equal(flagProblems(hooksOf('.claude/settings.json'), codexHooks).length, 2);
});
