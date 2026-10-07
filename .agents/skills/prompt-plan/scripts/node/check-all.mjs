// Runs, in order, the checks of every fragment up to the one given (or all): node all.mjs [NN]
// Copied to check/all.mjs; exits non-zero when any check fails.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const checkDir = dirname(fileURLToPath(import.meta.url));
const upTo = process.argv[2] ? String(process.argv[2]).padStart(2, '0') : '99';
let failed = false;
for (const script of readdirSync(checkDir).filter((name) => /^\d{2}-check\.mjs$/.test(name) && name.slice(0, 2) <= upTo).sort()) {
  if (spawnSync(process.execPath, [join(checkDir, script)], { stdio: 'inherit' }).status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
