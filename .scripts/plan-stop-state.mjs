// The counter check-plan-stop.mjs keeps per plan and per session or subagent in the plan's .cache/stop-guard/, which
// bounds how often it blocks a stop: MAX_STALE blocks in a row with the same open items in one turn, and at most
// MAX_WINDOW blocks in any WINDOW_MINUTES, whatever turn they fall in, so that a client whose continuation reads as a
// new turn is bounded too. Every access goes through safe-fs.mjs, so a symlink in .temp/ leads nowhere.

import { closeSync, constants, lstatSync, unlinkSync, writeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PLANS, readPlanFile } from './plan-stop.mjs';
import { inFolder, openRegular } from './safe-fs.mjs';

export const MAX_STALE = 3;
export const MAX_WINDOW = 20;
export const WINDOW_MINUTES = 30;
const STATE = '.cache/stop-guard';
const folder = (plan) => `${PLANS}/${plan}/${STATE}`;

export function readState(root, plan, actor) {
  try {
    const state = JSON.parse(readPlanFile(root, plan, `${STATE}/${actor}`));
    return state && typeof state === 'object' ? state : null;
  } catch {
    return null;
  }
}

// Writes the state and reads it back: false when a symlink or anything else kept it from being stored.
export function writeState(root, plan, actor, state) {
  const done = inFolder(root, folder(plan), true, () => {
    const fd = openRegular(actor, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC);
    try {
      writeSync(fd, JSON.stringify(state));
    } finally {
      closeSync(fd);
    }
    return true;
  });
  return done === true && JSON.stringify(readState(root, plan, actor)) === JSON.stringify(state);
}

export function dropState(root, plan, actor) {
  try {
    inFolder(root, folder(plan), false, () => lstatSync(actor, { throwIfNoEntry: false })?.isFile() && unlinkSync(actor));
  } catch {}
}

// Counts one more block for the open items in the turn `turn`, from the stored state: 'block' with the count in the
// window and whether it is the last one, or 'release' when a limit is reached or the count could not be kept, after
// which the same turn goes through unchecked.
export function count(root, plan, actor, stored, turn, items) {
  const now = Date.now();
  // Line numbers stay out of the fingerprint, so a line that only moves is no progress.
  const fingerprint = createHash('sha256').update(items.map((item) => item.replace(/^(review\/report\.md):\d+:/, '$1:')).join('\n')).digest('hex');
  const prior = stored?.turn === turn ? stored : null;
  const times = (Array.isArray(stored?.times) ? stored.times : []).filter((time) => now - time < WINDOW_MINUTES * 60_000);
  const stale = prior?.fingerprint === fingerprint ? prior.stale + 1 : 1;
  if (stale > MAX_STALE || times.length >= MAX_WINDOW) {
    writeState(root, plan, actor, { turn, released: true, times });
    return { verdict: 'release' };
  }
  const blocks = times.length + 1;
  if (!writeState(root, plan, actor, { turn, fingerprint, stale, times: [...times, now] })) return { verdict: 'release', lost: true };
  return { verdict: 'block', blocks, last: stale === MAX_STALE || blocks === MAX_WINDOW, window: blocks === MAX_WINDOW };
}
