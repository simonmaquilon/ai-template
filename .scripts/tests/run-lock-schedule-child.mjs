// The child of run-lock-schedule.mjs: makes one acquisition of the lock "e2e" and stops, telling its parent on stdout,
// before every change it makes to the lock folder (a file created exclusively, a file removed) until the file
// <id>-<n>.go exists in the control folder. It prints the answer of the acquisition as its last line.

import fs, { existsSync, writeSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { basename, join } from 'node:path';

const { STORE, DIR, CTL, ID } = process.env;
let step = 0;
const sleep = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);

function pause(what, path) {
  const go = join(CTL, `${ID}-${++step}.go`);
  writeSync(1, `pause ${what} ${basename(path)}\n`);
  while (!existsSync(go)) sleep();
}

const { unlinkSync, writeFileSync } = fs;
fs.unlinkSync = (path, ...rest) => (pause('remove', path), unlinkSync(path, ...rest));
fs.writeFileSync = (path, data, options) => (options?.flag === 'wx' && pause('create', path), writeFileSync(path, data, options));
syncBuiltinESMExports();

const { acquire } = await import(STORE);
writeSync(1, `${JSON.stringify(acquire('e2e', { dir: DIR, command: ID }))}\n`);
