// Runs, in order, the checks of every fragment up to the one given (or all): node all.mjs [NN]
// Copied to check/all.mjs; exits non-zero when any check fails. It runs only NN-check scripts: never an NN-measure
// script, whose run is a fragment's measurement, nor a helpers module the scripts import.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const checkDir = dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2];
// Anything but a fragment number, such as --baseline, would compare as text and silently run no check.
if (process.argv.length > 3 || (arg !== undefined && !/^\d{1,2}$/.test(arg))) {
  console.error('Usage: node all.mjs [NN]. Run a single NN-check or NN-measure script directly for a --baseline or --dry-run run.');
  process.exit(2);
}
const upTo = arg ? arg.padStart(2, '0') : '99';
let failed = false;
for (const script of readdirSync(checkDir).filter((name) => /^\d{2}-check\.mjs$/.test(name) && name.slice(0, 2) <= upTo).sort()) {
  if (spawnSync(process.execPath, [join(checkDir, script)], { stdio: 'inherit' }).status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
