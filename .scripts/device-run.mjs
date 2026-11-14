// How device.mjs runs a binary: always an absolute path and an argument array, never a shell, with a time limit and a
// bounded output, and without the variables that make a tool load code the launcher did not name.

import { spawn, spawnSync } from 'node:child_process';
import { clean } from './device-parse.mjs';

const DROPPED = ['DEVELOPER_DIR', 'JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS', 'ANDROID_EMULATOR_LAUNCHER_DIR'];

export function childEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !DROPPED.includes(name)));
}

// { status, stdout, stderr, error } of a finished binary; `error` is set when it did not run or ran out of time.
export function exec(file, args, { timeout = 30000 } = {}) {
  const run = spawnSync(file, args, { encoding: 'utf8', shell: false, stdio: ['ignore', 'pipe', 'pipe'], timeout,
    maxBuffer: 1 << 20, windowsHide: true, env: childEnv() });
  return { status: run.status, stdout: run.stdout ?? '', stderr: run.stderr ?? '', error: run.error };
}

// The output of a run that succeeded, or an Error that says what failed and why, from a sanitized first line.
export function must(result, what) {
  if (result.error) throw new Error(`${what} ${result.error.code === 'ETIMEDOUT' ? 'timed out' : `did not run (${clean(result.error.code ?? result.error.message, 80)})`}`);
  if (result.status !== 0) {
    const line = result.stderr.trim().split('\n')[0];
    throw new Error(`${what} exited with ${result.status}${line ? `: ${clean(line)}` : ''}`);
  }
  return result.stdout;
}

// Starts a binary detached from this process, so it outlives the launcher. problem() tells later whether it failed to
// start or ended with an error; a clean exit is not a problem, since a launcher may hand over to another process.
export function launch(file, args) {
  const state = {};
  const child = spawn(file, args, { detached: true, stdio: 'ignore', shell: false, windowsHide: true, env: childEnv() });
  child.on('error', (error) => { state.problem = `did not start (${clean(error.code ?? error.message, 80)})`; });
  child.on('exit', (code, signal) => { if (code !== 0) state.problem = `ended with ${code ?? signal}`; });
  child.unref();
  return { problem: () => state.problem };
}
