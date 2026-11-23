#!/usr/bin/env node
// A lock for runs that must exclude each other, such as a test run that binds a fixed port or mutates shared local state
// (04-validation-and-testing.md), that judges whether one is in progress from its own lock file and never from a process
// or port listing, which a sandbox can blank:
//   node .scripts/run-lock.mjs <name> -- <command> [args...]   takes the lock <name> ([a-z0-9-]+), runs the command with
//     the inherited stdio, keeps the lock alive while it runs, releases it when it ends or on SIGINT, SIGTERM or SIGHUP,
//     which it forwards to the command, warns on stderr if the lock file stops being its own, and exits with the command's code; while another run holds the lock it runs nothing, prints
//     one line naming the holder and exits with 75
//   node .scripts/run-lock.mjs status [<name>]                 prints one line per lock, free, busy or expired, only reading,
//     and exits 1 when one is busy
// A usage error exits with 64. The functions below are the same ones for a project script to import. The lock files, the
// heartbeat and the expiry are in run-lock-store.mjs, and how the command starts on Windows in run-lock-command.mjs.

import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { constants } from 'node:os';
import { fileURLToPath } from 'node:url';
import { commandLine } from './run-lock-command.mjs';
import { acquire, inspect, keepAlive, locks, release } from './run-lock-store.mjs';

export { commandLine } from './run-lock-command.mjs';
export * from './run-lock-store.mjs';

const BUSY = 75;
const USAGE = 64;
const seconds = (ms) => Math.round(ms / 1000);

function describe({ name, state, pid, started, command, ageMs }) {
  return state === 'free' ? `${name}: free` : `${name}: ${state} pid ${pid}, last beat ${seconds(ageMs)}s ago, started ${started}: ${command}`;
}

function fail(message, code = USAGE) {
  console.error(`run-lock: ${message}`);
  process.exit(code);
}

function status(argv) {
  try {
    const found = (argv[0] ? [argv[0]] : locks()).map((name) => inspect(name));
    found.forEach((info) => console.log(describe(info)));
    if (found.length === 0) console.log('no locks');
    process.exitCode = found.some(({ state }) => state === 'busy') ? 1 : 0;
  } catch (error) {
    fail(error.message);
  }
}

function wrap([name, separator, command, ...args]) {
  if (separator !== '--' || !command) fail('usage: node .scripts/run-lock.mjs <name> -- <command> [args...] | status [<name>]');
  let spec;
  let taken;
  try {
    spec = commandLine(command, args);
    taken = acquire(name, { command: [command, ...args].join(' ') });
  } catch (error) {
    fail(error.message);
  }
  if (!taken.ok) {
    const { pid, started, command: held, ageMs } = taken.holder;
    fail(`${name} is held by pid ${pid} since ${started} (last beat ${seconds(ageMs)}s ago): ${held}`, BUSY);
  }
  const stop = keepAlive(taken.lock, undefined, () => console.error(`run-lock: the lock ${name} is no longer this run's (its file was replaced or removed), so another run may have started`));
  process.on('exit', () => release(taken.lock));
  const child = spawn(spec.file, spec.args, { stdio: 'inherit', windowsVerbatimArguments: spec.verbatim });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
  child.on('error', (error) => {
    console.error(`run-lock: cannot run ${command}: ${error.message}`);
    stop();
    process.exitCode = 127;
  });
  child.on('exit', (code, signal) => {
    stop();
    process.exitCode = code ?? 128 + (constants.signals[signal] ?? 0);
  });
}

function isMain() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const argv = process.argv.slice(2);
  if (argv[0] === 'status') status(argv.slice(1));
  else wrap(argv);
}
