#!/usr/bin/env node
// Enforces the release rule of 12-version-control.md before a shell command runs: in the maintained template, a git
// push that publishes a tag and gh release create need the CI of their commit to have passed. It reads the agent
// client's hook input as check-destructive-push.mjs does, with the same readings and the same flags, and when
// release-command.mjs finds such a command, asks gh (release-ci.mjs) about the commit of the tag or release
// (release-target.mjs). A commit whose CI passed, or that has no active workflow, passes silently; one whose CI is
// pending, failed, missing, or unverified gets the user's confirmation as a permission decision on stdout in Claude
// Code, or, with --deny, which the Codex hook passes because Codex does not support asking, its reason on stderr with
// exit status 2. Any other command, a command in another repository than the maintained template, and a command too
// nested to read, which the push hook already asks about or rejects, pass silently without starting gh.

import { releaseCommands } from './release-command.mjs';
import { ciState } from './release-ci.mjs';
import { releaseTargets } from './release-target.mjs';
import { enterRepositoryRoot, governed, readHookInput } from './hook-support.mjs';
import { maintainedTemplate } from './template-files.mjs';

const CASES = {
  pending: 'is still running',
  failed: 'failed',
  none: 'has not started a run',
  unknown: 'could not be verified',
};

const input = await readHookInput();
const readings = input?.tool_name === 'PowerShell' ? [true] : process.argv.includes('--powershell') ? [true, false] : [false];
const cwd = typeof input?.cwd === 'string' ? input.cwd : process.cwd();
const text = [input?.tool_input?.command ?? []].flat().join(' ');

let findings = [];
try {
  findings = releaseCommands(input?.tool_input?.command, { readings, cwd });
} catch {
  // Too nested to read: the destructive-push hook asks or rejects it.
}

if (findings.length > 0 && governed(text, cwd) && enterRepositoryRoot() && maintainedTemplate().maintained) {
  const states = new Map();
  for (const { kind, name, sha } of releaseTargets(findings)) {
    if (!states.has(sha)) states.set(sha, sha ? ciState(sha) : 'unknown');
    const state = states.get(sha);
    if (!(state in CASES)) continue;
    const what = kind === 'release' ? `gh release create publishes release ${name}` : `this git push publishes ${name ? `tag ${name}` : 'tags'}`;
    const message = `12-version-control.md: ${what} (commit ${sha ? sha.slice(0, 7) : 'unresolved'}), but the CI of that commit ${CASES[state]}; ` +
      'wait for the CI to pass or get the user\'s explicit authorization.';
    if (process.argv.includes('--deny')) {
      console.error(message);
      process.exit(2);
    }
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: message } }));
    break;
  }
}
