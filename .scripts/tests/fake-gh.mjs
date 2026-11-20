// A stand-in for the gh CLI, found first on PATH, for the release tests: the same executable as node under the name gh,
// which runs a preloaded script (NODE_OPTIONS) that answers `run list` and `workflow list` from the configuration, records
// every call, and exits before node looks for a program, so it works on every operating system without a shell. The
// preload acts only when the process was started as gh, so the node processes of the tests are not affected.

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { ROOT, WINDOWS } from './support.mjs';

const PRELOAD = `const fs = require('node:fs');
const path = require('node:path');
if (/^gh(\\.exe)?$/i.test(path.basename(process.argv0))) {
  const dir = process.env.FAKE_GH_DIR;
  const args = [path.basename(process.argv[1]), ...process.argv.slice(2)];
  fs.appendFileSync(path.join(dir, 'calls.log'), JSON.stringify(args) + '\\n');
  const mode = JSON.parse(fs.readFileSync(path.join(dir, 'mode.json'), 'utf8'));
  const key = args.slice(0, 2).join(' ');
  if (mode.fail.includes(key)) process.exit(1);
  const out = { 'run list': mode.runs, 'workflow list': mode.workflows }[key] ?? '';
  fs.writeSync(1, typeof out === 'string' ? out : JSON.stringify(out));
  process.exit(0);
}
`;

// runs and workflows answer `gh run list` and `gh workflow list`, as objects or, for unreadable output, as text; fail
// lists the commands, such as 'run list', that exit with status 1. vars are the environment variables that put it first on
// PATH, and missing the ones under which no gh is found at all; calls() lists each call's arguments.
export function fakeGh(t, { runs = [], workflows = [], fail = [] } = {}) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.temp', 'gh-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  mkdirSync(join(dir, 'bin'));
  mkdirSync(join(dir, 'empty'));
  const exe = join(dir, 'bin', WINDOWS ? 'gh.exe' : 'gh');
  if (WINDOWS) copyFileSync(process.execPath, exe);
  else symlinkSync(process.execPath, exe);
  writeFileSync(join(dir, 'fake.cjs'), PRELOAD);
  writeFileSync(join(dir, 'mode.json'), JSON.stringify({ runs, workflows, fail }));
  const pathKey = Object.keys(process.env).find((name) => name.toLowerCase() === 'path') ?? 'PATH';
  const options = `--require "${join(dir, 'fake.cjs').replaceAll('\\', '/')}"`;
  return {
    dir,
    vars: { [pathKey]: `${join(dir, 'bin')}${delimiter}${process.env[pathKey]}`, NODE_OPTIONS: options, FAKE_GH_DIR: dir },
    missing: { [pathKey]: join(dir, 'empty') },
    calls() {
      try { return readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)); } catch { return []; }
    },
  };
}

// Runs fn with these variables set in this process, which every process it starts inherits, and restores them.
export function withEnv(vars, fn) {
  const before = Object.keys(vars).map((name) => [name, process.env[name]]);
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const [name, value] of before) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}
