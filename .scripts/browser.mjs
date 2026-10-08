#!/usr/bin/env node
// Runs an agent-operated browser session command through the `cli` of the
// `playwright` package at the version STACK.md pins, from the repository root:
//   node .scripts/browser.mjs [-s=<session>] <command> [args...]
// The client sandbox cannot start Chromium on macOS, so .claude/settings.json
// exempts this script. Because it runs unconfined, it lets through only the
// command lines browser-args.mjs allows, reads no configuration a confined
// command could have changed beyond the expected .playwright/cli.config.json,
// and runs Playwright from a per-user cache outside the repository and the
// temporary directory, where confined commands cannot write, installing it
// there with npm from that folder so no project npm configuration applies.

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkArgs } from './browser-args.mjs';
import { npmScripts } from './npm-cli.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = { outputDir: '.temp/playwright-cli' };

function fail(message, blocked = true) {
  console.error(`browser: ${message}.${blocked ? " Run it through the client's approval instead (.readme/91-agent-sandbox.md)." : ''}`);
  process.exit(1);
}

const isLink = (path) => lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink();

function checkConfig() {
  const file = join(ROOT, '.playwright', 'cli.config.json');
  for (const path of [dirname(file), file, join(ROOT, '.temp'), join(ROOT, '.temp', 'playwright-cli')]) {
    if (isLink(path)) fail(`${path} is a symbolic link`);
  }
  let config;
  try {
    config = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    fail('.playwright/cli.config.json is missing or not valid JSON');
  }
  if (JSON.stringify(config) !== JSON.stringify(CONFIG)) fail(`.playwright/cli.config.json must be exactly ${JSON.stringify(CONFIG)}`);
}

function pinnedVersion() {
  const stack = readFileSync(join(ROOT, 'STACK.md'), 'utf8');
  const section = stack.split(/^## /m).find((part) => part.startsWith('Template Tooling'));
  return /^\| `playwright` \| (\d+\.\d+\.\d+) \|/m.exec(section ?? '')?.[1]
    ?? fail('the Template Tooling table of STACK.md pins no playwright version', false);
}

// The per-user cache folder of each system, which the client sandbox does not let confined commands write.
function cacheDir() {
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'agent-browser');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'agent-browser');
  return join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'agent-browser');
}

const installedVersion = (dir, name) => {
  try {
    return JSON.parse(readFileSync(join(dir, 'node_modules', name, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
};

function install(version) {
  const dir = join(cacheDir(), `playwright-${version}`);
  const ready = () => ['playwright', 'playwright-core'].every((name) => installedVersion(dir, name) === version);
  if (ready()) return dir;
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, 'package.json'))) writeFileSync(join(dir, 'package.json'), '{ "private": true }\n');
  const scripts = npmScripts() ?? fail('npm CLI scripts not found for this Node', false);
  const run = spawnSync(process.execPath, [join(scripts, 'npm-cli.js'), 'install', '--no-save', '--ignore-scripts',
    '--no-audit', '--no-fund', `playwright@${version}`], { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'] });
  if (run.status !== 0 || !ready()) fail(`installing playwright@${version} in ${dir} failed`, false);
  return dir;
}

// Reads the arguments again with the installed CLI's own parser and flags, and refuses when it would run
// another command than the one checked, or when that parser is not where this version keeps it.
function sameCommand(dir, args, command) {
  try {
    const client = join(dir, 'node_modules', 'playwright-core', 'lib', 'tools', 'cli-client');
    const require = createRequire(join(client, 'program.js'));
    const { minimist } = require('./minimist.js');
    const boolean = [...require('./help.json').booleanOptions, 'all', 'g', 'help', 'json', 'raw', 'version'];
    if (minimist(args, { boolean, string: ['_'] })._[0] === command) return;
  } catch {
    // An unreadable parser fails closed below.
  }
  fail("the CLI's own parser does not read the same command");
}

const args = process.argv.slice(2);
let command;
try {
  command = checkArgs(args, ROOT);
} catch (error) {
  fail(error.message);
}
checkConfig();
const dir = install(pinnedVersion());
sameCommand(dir, args, command);
const cli = join(dir, 'node_modules', 'playwright', 'cli.js');
const run = spawnSync(process.execPath, [cli, 'cli', ...args], { cwd: ROOT, stdio: 'inherit' });
if (run.error) fail(run.error.message, false);
process.exit(run.status ?? 1);
