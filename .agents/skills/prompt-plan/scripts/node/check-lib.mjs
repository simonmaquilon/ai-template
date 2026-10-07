// Shared helpers for the plan's NN-check scripts; copied to check/lib.mjs.
// Runs commands from the project root, stores each run in review/NN-check-<UTC stamp>.log, and exits
// non-zero on any failure. It writes only to review/ and, when a check isolates a tool, the plan's .cache/.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const checkDir = dirname(fileURLToPath(import.meta.url));
export const planDir = dirname(checkDir);
export const reviewDir = join(planDir, 'review');
export const cacheDir = join(planDir, '.cache');
export const root = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: checkDir, encoding: 'utf8' }).stdout.trim() || process.cwd();
export const utcStamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const MAX_BUFFER = 1024 ** 3;
const isWindows = process.platform === 'win32';

// Environment for project commands, left as the baseline measured it except for NO_COLOR. isolateHome moves
// HOME and the npm cache into the plan's .cache/ for tools the sandbox blocks in the real home directory.
export function toolEnv({ isolateHome = false } = {}) {
  const env = { ...process.env, NO_COLOR: '1' };
  if (isolateHome) {
    env.HOME = join(cacheDir, 'home');
    env.npm_config_cache = join(cacheDir, 'npm');
    mkdirSync(env.HOME, { recursive: true });
  }
  return env;
}

// A project command that must exit with status 0. reportPending: true runs it but reports PENDING, for a
// check that covers the recommended option of a decision still open.
export const command = (id, label, cmd, args, options = {}) => ({ id, label, cmd, args, options });

// A test command whose only allowed failures are the named tests the prompt's measured baseline records as
// failing before the change. parseFailures(stdout) returns the failing test names.
export const commandAllowing = (id, label, cmd, args, allowed, parseFailures, options = {}) => ({ id, label, cmd, args, options, allowed, parseFailures });

// A condition computed by the check script itself.
export const condition = (id, label, ok, detail = '') => ({ id, label, ok, detail });

// A criterion that waits on a decision with no recommended option, a pending datum, or a person's judgment: reported, never run.
export const pending = (id, label) => ({ id, label, pending: true });

function evaluate(check) {
  if (check.pending) return { status: 'PENDING', output: 'Not run; see the fragment.' };
  if ('ok' in check) return { status: check.ok ? 'PASS' : 'FAIL', output: check.detail };
  const result = spawnSync(check.cmd, check.args, { cwd: root, encoding: 'utf8', env: toolEnv(check.options), shell: isWindows, maxBuffer: MAX_BUFFER });
  if (result.error) return { status: 'FAIL', output: `$ ${check.cmd} ${check.args.join(' ')}\ncould not run: ${result.error.message}` };
  const output = `$ ${check.cmd} ${check.args.join(' ')}\nexit status: ${result.status}\n${result.stdout ?? ''}${result.stderr ?? ''}`;
  let passed = result.status === 0;
  let detail = output;
  if (check.allowed) {
    const failing = check.parseFailures(result.stdout ?? '');
    const unexpected = failing.filter((name) => !check.allowed.includes(name));
    // A runner that fails without reporting any test failure crashed: that is never an allowed failure.
    passed = unexpected.length === 0 && (result.status === 0 || failing.length > 0);
    detail = `${output}\nfailing: ${JSON.stringify(failing)}; allowed: ${JSON.stringify(check.allowed)}`;
  }
  if (check.options.reportPending) return { status: 'PENDING', output: `${detail}\nresult with the recommended option: ${passed ? 'pass' : 'fail'}` };
  return { status: passed ? 'PASS' : 'FAIL', output: detail };
}

function stop(server) {
  if (server.exitCode !== null) return;
  if (isWindows) spawnSync('taskkill', ['/T', '/F', '/PID', String(server.pid)]);
  else {
    try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already stopped */ }
  }
}

// Starts a server command, waits until url answers, runs fn(url), and always stops the server and its
// children. Use a fixed port with the server's strict-port option, checked free beforehand: if the server
// exits before answering, the port was taken and the check fails instead of using someone else's server.
export async function withServer(cmd, args, url, fn, options = {}) {
  const server = spawn(cmd, args, { cwd: root, env: toolEnv(options), stdio: 'ignore', detached: !isWindows, shell: isWindows });
  try {
    for (let i = 0; i < 75; i += 1) {
      if (server.exitCode !== null) throw new Error(`${cmd} ${args.join(' ')} exited with ${server.exitCode} before answering at ${url}.`);
      try { if ((await fetch(url)).ok) return await fn(url); } catch { /* not up yet */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`${cmd} ${args.join(' ')} did not answer at ${url}.`);
  } finally {
    stop(server);
  }
}

export function runChecks(fragment, checks, extraLines = []) {
  const lines = [`Fragment ${fragment} · ${new Date().toISOString()} · ${root}`, ...extraLines];
  let failed = 0;
  for (const check of checks) {
    const { status, output } = evaluate(check);
    if (status === 'FAIL') failed += 1;
    lines.push('', `## ${status} ${check.id}: ${check.label}`, String(output).trimEnd());
    console.log(`${status.padEnd(7)} ${check.id}: ${check.label}`);
  }
  mkdirSync(reviewDir, { recursive: true });
  const file = join(reviewDir, `${fragment}-check-${utcStamp()}.log`);
  writeFileSync(file, `${lines.join('\n')}\n`);
  console.log(`Fragment ${fragment}: ${failed} failing. Evidence: ${relative(root, file)}`);
  process.exitCode = failed ? 1 : 0;
}
