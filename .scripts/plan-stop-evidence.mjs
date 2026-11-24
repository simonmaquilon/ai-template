// Loads, for check-plan-stop.mjs, the evidence evaluator that a plan's prompt-plan skill checks in, only from a regular
// file of the repository that no symlink leads out of; null when it cannot be loaded.

import { lstatSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function statusChecker() {
  const source = new URL('../.agents/skills/prompt-plan/scripts/node/check-report.mjs', import.meta.url);
  try {
    if (lstatSync(source, { throwIfNoEntry: false })?.isFile() && realpathSync.native(source) === fileURLToPath(source)) {
      const { checkStatus } = await import(source.href);
      if (typeof checkStatus === 'function') return checkStatus;
    }
  } catch {}
  return null;
}
