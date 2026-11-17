import assert from 'node:assert/strict';
import test from 'node:test';
import { CLAUDE_ONLY, hookList, hooksOf, key, mapped, tools } from './hook-registry-fixture.mjs';

// The Claude Code and Codex hooks as (event, script, Codex matcher) lines, which must be the same lines.
function matcherLines(claudeHooks, codexHooks) {
  const lines = (list) => list.filter(({ event }) => !(event in CLAUDE_ONLY)).map(key).sort();
  return [lines(hookList(claudeHooks, true).map(mapped)), lines(hookList(codexHooks, false))];
}

// Two Claude Code matchers correspond to Codex's Bash, so the map alone cannot tell them apart: only the NUL hook leaves
// PowerShell out, which reads NUL as the null device. This lists the hooks whose matcher is not Bash|PowerShell|Monitor.
const WITHOUT_POWERSHELL = new Set(['check-nul-redirect.mjs']);
function shellLines(claudeHooks) {
  return hookList(claudeHooks, true).filter((hook) => mapped(hook).matcher === 'Bash')
    .filter((hook) => hook.matcher !== tools(WITHOUT_POWERSHELL.has(hook.script) ? 'Bash|Monitor' : 'Bash|PowerShell|Monitor')).map(key);
}

// A client file with the matcher of the group that runs `script` in `event` replaced.
function withMatcher(file, event, script, matcher) {
  const hooks = hooksOf(file);
  hooks[event].find((group) => group.hooks.some((hook) => JSON.stringify(hook).includes(script))).matcher = matcher;
  return hooks;
}

test('every Claude Code hook matches the tools of the Codex hook it corresponds to', () => {
  const [claudeLines, codexLines] = matcherLines(hooksOf('.claude/settings.json'), hooksOf('.codex/hooks.json'));
  assert.ok(claudeLines.length > 0);
  assert.deepEqual(claudeLines, codexLines);
  assert.deepEqual(shellLines(hooksOf('.claude/settings.json')), []);
});

test('a Claude Code matcher that stops covering a tool, or a different Codex matcher, fails the correspondence', () => {
  for (const [event, script, matcher] of [['PreToolUse', 'check-nul-redirect.mjs', 'Bash'], ['PreToolUse', 'check-bulk-staging.mjs', 'Bash|PowerShell'],
    ['PostToolUse', 'check-protected-paths.mjs', 'Bash|PowerShell']]) {
    const [left, right] = matcherLines(withMatcher('.claude/settings.json', event, script, matcher), hooksOf('.codex/hooks.json'));
    assert.notDeepEqual(left, right, `${script} as ${matcher}`);
  }
  for (const [event, script, matcher] of [['PreToolUse', 'check-protected-paths.mjs', 'Bash|Monitor'], ['PreToolUse', 'check-nul-redirect.mjs', 'Bash|PowerShell|Monitor']]) {
    assert.notDeepEqual(shellLines(withMatcher('.claude/settings.json', event, script, matcher)), [], `${script} as ${matcher}`);
  }
  for (const [event, script, matcher] of [['PreToolUse', 'check-nul-redirect.mjs', 'Bash|PowerShell'], ['PostToolUse', 'check-markdown.mjs', 'Edit|Write']]) {
    const [left, right] = matcherLines(hooksOf('.claude/settings.json'), withMatcher('.codex/hooks.json', event, script, matcher));
    assert.notDeepEqual(left, right, `${script} as ${matcher} in Codex`);
  }
});

test('a reordered matcher is the same matcher', () => {
  const [left, right] = matcherLines(withMatcher('.claude/settings.json', 'PreToolUse', 'check-nul-redirect.mjs', 'Monitor|Bash'), hooksOf('.codex/hooks.json'));
  assert.deepEqual(left, right);
});
