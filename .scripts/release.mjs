#!/usr/bin/env node
// Releases the maintained template (12-version-control.md): pushes the branch, waits for the CI of its commit to pass,
// and only then tags the commit with the version in .agents/template-version, pushes the tag, and creates the release.
// Runs from any folder of the repository. Exit status: 0 when the release is published, 1 when it is not, 2 on misuse.
//
//   node .scripts/release.mjs --notes <file> [--timeout <minutes>]      the notes file, outside the tracked files, such
//                                                                       as under .temp/; the wait is 60 minutes
//
// It refuses before touching anything (release-checks.mjs). A commit with no active workflow is published without CI,
// and the script says so; a CI that failed, stays out of sight (none or unknown) for 3 minutes, or does not finish
// within the time limit stops it before the tag. A failure after the tag says what was left done. The push and the
// release it starts are made by this program, not by a shell command, so the release hook does not see them.

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { enterRepositoryRoot, git } from './hook-support.mjs';
import { ciState } from './release-ci.mjs';
import { readiness } from './release-checks.mjs';
import { waitForCi } from './release-wait.mjs';

const USAGE = 'Usage: node .scripts/release.mjs --notes <file> [--timeout <minutes>]';
const STEP_MS = 5 * 60 * 1000;
const POLL_MS = 30 * 1000;
const GRACE_MS = 3 * 60 * 1000;

const say = (line) => console.log(`release: ${line}`);
function stop(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

function options(argv) {
  const given = { timeout: 60 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--notes' && argv[i + 1] !== undefined) given.notes = argv[++i];
    else if (argv[i] === '--timeout' && argv[i + 1] !== undefined) given.timeout = Number(argv[++i]);
    else return null;
  }
  return given.notes && given.timeout > 0 && Number.isFinite(given.timeout) ? given : null;
}

// One command without a shell and with a time limit, and what it printed.
function step(command, args) {
  const run = spawnSync(command, args, { encoding: 'utf8', timeout: STEP_MS, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim() || String(run.error ?? '');
  return { ok: run.status === 0 && !run.error, timedOut: run.error?.code === 'ETIMEDOUT', output };
}

// Whether origin holds the tag, asked of origin: "is in origin", "is not in origin", or "could not be checked in origin".
function tagInOrigin(tag) {
  const listed = step('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]);
  if (!listed.ok) return 'could not be checked in origin';
  return listed.output === '' ? 'is not in origin' : 'is in origin';
}

const given = options(process.argv.slice(2));
if (!given) {
  console.error(USAGE);
  process.exit(2);
}
const notes = resolve(process.cwd(), given.notes);
if (!enterRepositoryRoot()) stop('this folder is not inside the repository that holds these scripts');
const { error, branch, version } = readiness(notes);
if (error) stop(error);

const sha = git(['rev-parse', 'HEAD'])?.trim() ?? stop('git cannot read HEAD');
const short = sha.slice(0, 7);
// The commit goes by its id to the full name of the branch, so that a branch name that starts with + or : cannot make the
// push force or delete, and a HEAD that moves meanwhile cannot push another commit.
const pushed = step('git', ['push', 'origin', `${sha}:refs/heads/${branch}`]);
if (!pushed.ok) stop(`pushing ${branch} to origin failed; nothing was tagged:\n${pushed.output}`);
say(`pushed ${branch} to origin`);

say(`waiting for the CI of ${short}, up to ${given.timeout} minutes`);
let last;
const outcome = await waitForCi(sha, {
  interval: POLL_MS, grace: GRACE_MS, limit: given.timeout * 60 * 1000,
  state(id) {
    const state = ciState(id);
    if (state !== last && !['passed', 'inactive', 'failed'].includes(state)) say(`CI state: ${state}`);
    last = state;
    return state;
  },
});
// Only a passed CI, or no active workflow, goes on; any other result stops before the tag.
if (outcome !== 'passed' && outcome !== 'inactive') {
  const reasons = {
    failed: `the CI of ${short} failed`,
    unverified: `the CI of ${short} stayed ${last} for ${GRACE_MS / 60000} minutes and cannot be verified`,
    timeout: `the CI of ${short} did not finish within ${given.timeout} minutes`,
  };
  stop(`${reasons[outcome] ?? `the CI of ${short} gave the unexpected result ${outcome}`}; nothing was tagged`);
}
say(outcome === 'inactive' ? 'no active workflow, so it publishes without CI' : `the CI of ${short} passed`);

const tagged = step('git', ['tag', version, sha]);
if (!tagged.ok) stop(`git tag failed; nothing was tagged:\n${tagged.output}`);
say(`tagged ${short} as ${version}`);
const tagPushed = step('git', ['push', 'origin', `refs/tags/${version}`]);
if (!tagPushed.ok) {
  stop(`pushing tag ${version} failed; the tag exists here and ${tagInOrigin(version)}; the release was not created:\n${tagPushed.output}`);
}
say(`pushed tag ${version} to origin`);
const created = step('gh', ['release', 'create', version, '--verify-tag', '--title', version, '--notes-file', notes]);
if (!created.ok) {
  const outcomeOfRelease = created.timedOut ? 'gh did not answer in time, so it could not be confirmed whether the release was created (gh release view)'
    : 'the release was not created';
  stop(`gh release create failed; tag ${version} exists here and in origin; ${outcomeOfRelease}:\n${created.output}`);
}
say(`published ${version}${created.output ? `: ${created.output}` : ''}`);
