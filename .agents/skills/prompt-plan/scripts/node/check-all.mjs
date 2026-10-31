// Runs, in order, the checks of every fragment up to the one given (or all): node all.mjs [NN] [--slow]
// Copied to check/all.mjs; exits non-zero when any check fails. It runs only NN-check scripts: never an NN-measure
// script, whose run is a fragment's measurement, nor a helpers module the scripts import. Given NN without --slow,
// the checks of earlier fragments skip their slow lines; without NN, every line runs. A command a check runs through
// lib's runOnce is reused within this run once it succeeds, and the shared results are removed when the run ends.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const checkDir = dirname(fileURLToPath(import.meta.url));
const onceDir = join(dirname(checkDir), '.cache', 'once');
const DAY = 24 * 60 * 60 * 1000;
const slow = process.argv.includes('--slow');
const rest = process.argv.slice(2).filter((arg) => arg !== '--slow');
const arg = rest[0];
// Anything but a fragment number from 1, such as --baseline or 00, would compare as text and silently run no check.
if (rest.length > 1 || (arg !== undefined && !/^(0?[1-9]|[1-9]\d)$/.test(arg))) {
  console.error('Usage: node all.mjs [NN] [--slow]. Run a single NN-check or NN-measure script directly for a --baseline or --dry-run run.');
  process.exit(2);
}
const upTo = arg ? arg.padStart(2, '0') : '99';
const run = new Date().toISOString().replace(/[:.]/g, '-');
// Removes the shared results that keep rejects.
const removeShared = (keep) => {
  if (!existsSync(onceDir)) return;
  for (const name of readdirSync(onceDir).filter((file) => !keep(file))) rmSync(join(onceDir, name), { force: true });
};
// At start-up, the shared results of runs that ended without reaching their cleanup, such as killed ones, go once a
// day old; a file another run removes meanwhile counts as recent, so it is left alone.
removeShared((file) => Date.now() - (statSync(join(onceDir, file), { throwIfNoEntry: false })?.mtimeMs ?? Date.now()) < DAY);
let failed = false;
try {
  for (const script of readdirSync(checkDir).filter((name) => /^\d{2}-check\.mjs$/.test(name) && name.slice(0, 2) <= upTo).sort()) {
    const earlier = arg !== undefined && !slow && script.slice(0, 2) < upTo;
    const env = { ...process.env, PROMPT_PLAN_RUN: run, PROMPT_PLAN_SKIP_SLOW: earlier ? '1' : '0' };
    if (spawnSync(process.execPath, [join(checkDir, script)], { stdio: 'inherit', env }).status !== 0) failed = true;
  }
} finally {
  removeShared((file) => !file.startsWith(`${run}-`));
}
process.exit(failed ? 1 : 0);
