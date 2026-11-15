#!/usr/bin/env node
// Starts the `appium-mcp` server, which an agent client declares as an MCP server over stdio, at the version that
// .agents/tool-versions.json records, from the repository root:
//   node .scripts/mobile-server.mjs           starts the server, wired to this process's stdin, stdout and stderr
//   node .scripts/mobile-server.mjs --check   installs it if needed, starts it, speaks MCP to it (initialize and tools/list),
//                                             prints one line with its name, version and number of tools, stops it, exits 0
// The client starts the server outside its sandbox, so it runs the code of an installed package without confinement. The
// package therefore does not come from .temp/npm-cache, which any confined command can rewrite, as run-pinned.mjs
// uses: it is installed with npm in a per-user cache outside the repository and the temporary directory, where confined
// commands cannot write, with --ignore-scripts, and each start compares the version and the integrity hash that npm
// recorded with what the .agents/tool-versions.json entry records (protected like .scripts), reinstalling on a mismatch
// and running nothing when the new install does not match either. Its `bin` must be a regular file inside the package.
// What it does not guarantee: the hash covers appium-mcp, not its dependencies, which npm resolves by version range;
// nothing validates the registry signature; and whoever edits .agents/tool-versions.json with the file tools picks the
// version that runs. Its own messages and npm's output go to stderr, never to stdout, which is the protocol's channel.
// Signals reach the server, its exit status becomes this one, and it ends when this process dies, whether or not a
// signal reaches it, through the IPC channel that the guard below watches, which also covers Windows. The tests
// set PINNED_NPM_CLI_DIR to a stand-in for npm and MOBILE_SERVER_CHECK_TIMEOUT_MS to a short handshake deadline.

import { spawn } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { constants } from 'node:os';
import { dirname, join, posix, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { install, unwritableCache } from './cache-install.mjs';
import { checkServer } from './mobile-server-check.mjs';
import { TOOL_VERSIONS, entryProblems, readToolVersions } from './tool-versions-file.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'appium-mcp';
const FOLDER = 'agent-mobile';
const ADD = `node .scripts/tool-versions.mjs --add ${NAME} --repository https://github.com/appium/appium-mcp`;
// Preloaded by the server: it exits when the IPC channel to this process closes, and does not keep itself alive for it.
// It takes itself out of execArgv so that the workers and the processes the server forks do not inherit it.
const GUARD = "data:text/javascript,if(process.channel){process.execArgv.splice(process.execArgv.indexOf('--import'),2);process.on('disconnect',()=>process.exit(1));process.channel.unref()}";
const CHECK_TIMEOUT = Number(process.env.MOBILE_SERVER_CHECK_TIMEOUT_MS) || 120_000;

function fail(message) {
  console.error(`mobile-server: ${message}.`);
  process.exit(1);
}

const args = process.argv.slice(2);
const checking = args.length === 1 && args[0] === '--check';
if (args.length > 0 && !checking) fail('usage: node .scripts/mobile-server.mjs [--check]; it takes no other argument and ran nothing');

// The recorded appium-mcp entry, which must be valid; the command that records it runs outside the sandbox.
function pinnedEntry() {
  const { data, error } = readToolVersions(ROOT);
  const problems = error ? [error] : data?.[NAME] === undefined ? ['it has none'] : entryProblems(NAME, data[NAME]);
  if (problems.length > 0) fail(`${TOOL_VERSIONS} holds no valid ${NAME} entry (${problems[0]}); run \`${ADD}\` outside the client sandbox, with its approval`);
  return data[NAME];
}

// The executable the installed package declares in its `bin`, which must be a regular file inside the package folder:
// a relative path without `..`, no drive or root, and no symbolic link on the way, so the entry can only run its own code.
function executable(dir) {
  const pkg = join(dir, 'node_modules', NAME);
  let bin;
  try {
    bin = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).bin;
  } catch {
    fail(`${join(pkg, 'package.json')} is missing or not valid JSON`);
  }
  const path = typeof bin === 'string' ? bin : bin?.[NAME];
  const parts = typeof path === 'string' ? path.split(/[\\/]+/).filter((part) => part !== '' && part !== '.') : [];
  if (parts.length === 0 || parts.includes('..') || posix.isAbsolute(path) || win32.isAbsolute(path) || /^[A-Za-z]:|\0/.test(path)) {
    fail(`the bin of ${NAME} is not a path inside its package (${JSON.stringify(path)}); nothing ran`);
  }
  let walked = join(dir, 'node_modules');
  for (const part of [NAME, ...parts]) {
    if (lstatSync(walked, { throwIfNoEntry: false })?.isSymbolicLink()) fail(`${walked} is a symbolic link; nothing ran`);
    walked = join(walked, part);
  }
  const stats = lstatSync(walked, { throwIfNoEntry: false });
  if (!stats?.isFile()) fail(`the bin of ${NAME}, ${walked}, is not a regular file; nothing ran`);
  return walked;
}

const cache = unwritableCache(FOLDER);
if (cache) {
  fail(`cannot write its cache ${cache}. It is most likely running inside the client sandbox: run it outside it, with the client's `
    + 'approval (.readme/91-agent-sandbox.md)');
}
const entry = pinnedEntry();
const { version, integrity, dependencies } = entry;
const dir = install({ folder: FOLDER, name: NAME, version, fail, timeout: 600_000,
  expected: { ...dependencies, [NAME]: { version, integrity } },
  announce: (to) => console.error(`mobile-server: installing ${NAME}@${version} in ${to}; the first start can take more than a minute`) });
const server = spawn(process.execPath, ['--import', GUARD, executable(dir)], { stdio: [checking ? 'pipe' : 'inherit', checking ? 'pipe' : 'inherit', 'inherit', 'ipc'] });
process.on('exit', () => server.kill());
server.on('error', (error) => fail(`cannot start ${NAME}: ${error.message}`));

if (checking) {
  try {
    console.log(await checkServer(server, CHECK_TIMEOUT));
  } catch (error) {
    fail(`${NAME} failed its check: ${error.message}`);
  }
  process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => server.kill(signal));
server.on('exit', (code, signal) => process.exit(code ?? 128 + (constants.signals[signal] ?? 1)));
