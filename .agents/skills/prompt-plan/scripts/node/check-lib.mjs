// Shared helpers for the plan's NN-check scripts; copied to check/lib.mjs.
// Runs commands from the project root, stores each run in review/NN-check-<UTC stamp>.log, or in
// review/NN-baseline-<UTC stamp>.log when the check runs with --baseline on the tree before the plan's
// fragments, and exits non-zero on any failure. It writes only to review/ and, when a check isolates a tool,
// the plan's .cache/.
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
export const runKind = process.argv.includes('--baseline') ? 'baseline' : 'check';
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

// Path in review/ for a check's own evidence, such as a screenshot: NN-<name>-<UTC stamp>.<ext>, or
// NN-baseline-<name>-<UTC stamp>.<ext> on a --baseline run.
export function evidenceFile(fragment, name, ext) {
  mkdirSync(reviewDir, { recursive: true });
  return join(reviewDir, `${fragment}-${runKind === 'baseline' ? 'baseline-' : ''}${name}-${utcStamp()}.${ext}`);
}

// A path relative to the project root, where lib runs commands, for a tool that refuses absolute paths, such as a
// browser launcher's --filename.
export const relativeToRoot = (path) => relative(root, path);

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

const exited = (child) => child.exitCode !== null || child.signalCode !== null;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Whether any process of a POSIX process group is still alive, the leader's children included.
function groupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Stops the server and every process it started: on Windows through taskkill, waiting up to 2 s for it to exit;
// elsewhere SIGTERM to its process group, then SIGKILL to whatever of the group is still alive 5 s later.
async function stop(server) {
  if (!server.pid) return;
  if (isWindows) {
    if (exited(server)) return;
    const gone = new Promise((resolve) => server.once('exit', resolve));
    spawnSync('taskkill', ['/T', '/F', '/PID', String(server.pid)]);
    // The fallback timer is unreferenced so it never holds the script open once the server is gone.
    await Promise.race([gone, new Promise((resolve) => setTimeout(resolve, 2000).unref())]);
    return;
  }
  if (!groupAlive(server.pid)) return;
  try { process.kill(-server.pid, 'SIGTERM'); } catch { return; /* already stopped */ }
  for (let waited = 0; waited < 5000 && groupAlive(server.pid); waited += 100) await pause(100);
  if (groupAlive(server.pid)) {
    try { process.kill(-server.pid, 'SIGKILL'); } catch { /* already stopped */ }
    for (let waited = 0; waited < 1000 && groupAlive(server.pid); waited += 100) await pause(100);
  }
}

// Starts a server command, waits up to 30 s until url answers, runs fn(url) once, and always stops the server and
// the processes it started. Only the wait retries: an error fn throws propagates as it is. Use a fixed port with
// the server's strict-port option, checked free beforehand: if the server exits before answering, the port was
// taken and the check fails instead of using someone else's server.
export async function withServer(cmd, args, url, fn, options = {}) {
  const server = spawn(cmd, args, { cwd: root, env: toolEnv(options), stdio: 'ignore', detached: !isWindows, shell: isWindows });
  let startError;
  server.once('error', (error) => { startError = error; });
  try {
    const deadline = Date.now() + 30000;
    let last = 'no answer';
    while (true) {
      if (startError) throw new Error(`${cmd} ${args.join(' ')} could not start: ${startError.message}`);
      if (exited(server)) throw new Error(`${cmd} ${args.join(' ')} exited with ${server.exitCode ?? server.signalCode} before answering at ${url}.`);
      const remaining = deadline - Date.now();
      if (remaining < 100) throw new Error(`${cmd} ${args.join(' ')} did not answer at ${url} (last: ${last}).`);
      try {
        // A redirect is an answer too: follow none, so the probe reaches no other address.
        const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(Math.min(5000, remaining)) });
        await response.body?.cancel();
        if (response.status < 400) break;
        last = `status ${response.status}`;
      } catch (error) {
        last = error.name === 'TimeoutError' ? 'timed out' : error.cause?.code ?? error.message;
      }
      await pause(200);
    }
    if (startError) throw new Error(`${cmd} ${args.join(' ')} could not start: ${startError.message}`);
    return await fn(url);
  } finally {
    await stop(server);
  }
}

export function runChecks(fragment, checks, extraLines = []) {
  const lines = [`Fragment ${fragment} · ${runKind} run · ${new Date().toISOString()} · ${root}`, ...extraLines];
  let failed = 0;
  for (const check of checks) {
    const { status, output } = evaluate(check);
    if (status === 'FAIL') failed += 1;
    lines.push('', `## ${status} ${check.id}: ${check.label}`, String(output).trimEnd());
    console.log(`${status.padEnd(7)} ${check.id}: ${check.label}`);
  }
  mkdirSync(reviewDir, { recursive: true });
  const file = join(reviewDir, `${fragment}-${runKind}-${utcStamp()}.log`);
  writeFileSync(file, `${lines.join('\n')}\n`);
  console.log(`Fragment ${fragment}: ${failed} failing. Evidence: ${relative(root, file)}`);
  process.exitCode = failed ? 1 : 0;
}
