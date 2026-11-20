// Waits for the CI of a commit for the release script: polls the state function every `interval` milliseconds and
// returns passed, inactive, or failed as soon as it gives one of them; unverified when none or unknown, in any mix,
// has lasted for `grace` milliseconds without a run in progress in between, because the runs of a push can take a
// while to appear, and then no longer means they will; and timeout when `limit` milliseconds have passed in all.
// state is called with the commit and returns what ciState (release-ci.mjs) does.

import { setTimeout as sleep } from 'node:timers/promises';

export async function waitForCi(sha, { state, interval, grace, limit }) {
  const started = Date.now();
  let unverifiedSince = null;
  for (;;) {
    const current = state(sha);
    if (['passed', 'inactive', 'failed'].includes(current)) return current;
    const now = Date.now();
    if (current === 'pending') unverifiedSince = null;
    else unverifiedSince ??= now;
    if (unverifiedSince !== null && now - unverifiedSince >= grace) return 'unverified';
    if (now - started >= limit) return 'timeout';
    await sleep(Math.min(interval, started + limit - now));
  }
}
