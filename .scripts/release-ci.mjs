// The state of the automation that ran on a commit, as the gh CLI reports it, for the release hook and the release
// script (12-version-control.md): pending while any run has not completed; failed when a completed run ended in anything
// but success, skipped, or neutral; passed when every run completed that way; for a commit with no run, inactive when no
// workflow is active and none when one is, which means the runs have not started or the commit never triggers them; and
// unknown whenever gh cannot answer: it is missing, fails, runs past its time limit, or prints what cannot be read.

import { spawnSync } from 'node:child_process';

const LIMIT_MS = 15000;
const PASSING = new Set(['success', 'skipped', 'neutral']);

// The JSON gh prints for these arguments, or null. gh runs without a shell, from the folder of the caller, which is
// where it finds the repository.
function gh(args) {
  const run = spawnSync('gh', args, { encoding: 'utf8', timeout: LIMIT_MS, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  if (run.error || run.status !== 0) return null;
  try {
    const value = JSON.parse(run.stdout);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

// One of passed, failed, pending, inactive, none, or unknown, for the full id of a commit.
export function ciState(sha) {
  const runs = gh(['run', 'list', '--commit', sha, '--json', 'status,conclusion,workflowName', '--limit', '100']);
  if (runs === null) return 'unknown';
  if (runs.length > 0) {
    if (runs.some((run) => run?.status !== 'completed')) return 'pending';
    return runs.every((run) => PASSING.has(run.conclusion)) ? 'passed' : 'failed';
  }
  const workflows = gh(['workflow', 'list', '--json', 'name,state']);
  if (workflows === null) return 'unknown';
  return workflows.length === 0 ? 'inactive' : 'none';
}
