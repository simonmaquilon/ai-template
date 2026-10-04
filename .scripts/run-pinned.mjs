#!/usr/bin/env node
// Runs agent tooling at the version that the Template Tooling or Project
// Tooling table of STACK.md pins, so no command has to carry a version:
//   node .scripts/run-pinned.mjs <package> [args...]      npx <package>@<version> [args...]
//   node .scripts/run-pinned.mjs --install <package>...   npm install -g <package>@<version>...
// npm's own CLI scripts run under this Node without a shell, so every argument
// reaches them literally on every system, and with their cache in .temp/npm-cache
// at the repository root. PINNED_NPM_CLI_DIR, used by the tests, names the
// directory that holds those scripts.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SECTIONS = ['Template Tooling', 'Project Tooling'];
const HEADER = '| Package | Version | License | Origin | Verification |';
const SEPARATOR = /^\|(?: *-{3,} *\|){5}$/;
const PACKAGE = /^`((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)`$/;
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

function fail(message) {
  console.error(`run-pinned: ${message}`);
  process.exit(1);
}

// Each section appears once and holds one table with HEADER, which ends at the
// first line that is not a table row; cells may contain escaped pipes.
function pinnedVersions() {
  let text;
  try {
    text = readFileSync(join(ROOT, 'STACK.md'), 'utf8');
  } catch {
    fail('STACK.md is missing from the repository root');
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const pins = new Map();
  for (const section of SECTIONS) {
    const start = lines.indexOf(`## ${section}`);
    if (start === -1) fail(`STACK.md has no "${section}" section`);
    if (lines.lastIndexOf(`## ${section}`) !== start) fail(`STACK.md has more than one "${section}" section`);
    const next = lines.findIndex((line, i) => i > start && line.startsWith('## '));
    const body = lines.slice(start + 1, next === -1 ? lines.length : next);
    const header = body.indexOf(HEADER);
    if (header === -1 || !SEPARATOR.test(body[header + 1] ?? '')) fail(`the ${section} table of STACK.md is malformed`);
    for (const line of body.slice(header + 2)) {
      if (!line.startsWith('|')) break;
      const cells = line.slice(1, line.endsWith('|') ? -1 : undefined).split(/(?<!\\)\|/).map((cell) => cell.trim());
      const name = PACKAGE.exec(cells[0])?.[1];
      if (cells.length !== 5 || !name) fail(`the ${section} table of STACK.md has a malformed row`);
      if (!VERSION.test(cells[1])) fail(`${name} has no exact version in STACK.md`);
      if (pins.has(name)) fail(`${name} is listed more than once in STACK.md`);
      pins.set(name, cells[1]);
    }
  }
  return pins;
}

// npm ships its CLI scripts beside Node on Windows and in ../lib/node_modules
// elsewhere; a separate npm on the PATH is found through its own bin.
function npmScripts() {
  if (process.env.PINNED_NPM_CLI_DIR) return process.env.PINNED_NPM_CLI_DIR;
  const node = dirname(process.execPath);
  const candidates = [join(node, 'node_modules', 'npm', 'bin'), join(node, '..', 'lib', 'node_modules', 'npm', 'bin')];
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    candidates.push(join(dir, 'node_modules', 'npm', 'bin'));
    try {
      candidates.push(dirname(realpathSync(join(dir, 'npm'))));
    } catch {
      // No npm in this directory.
    }
  }
  return candidates.find((dir) => existsSync(join(dir, 'npm-cli.js')) && existsSync(join(dir, 'npx-cli.js')))
    ?? fail('npm CLI scripts not found for this Node');
}

const [first, ...rest] = process.argv.slice(2);
const install = first === '--install';
if (first === undefined || (install && rest.length === 0)) {
  fail('usage: run-pinned.mjs <package> [args...] | --install <package>...');
}
const pins = pinnedVersions();
const pinned = (name) => (pins.has(name) ? `${name}@${pins.get(name)}`
  : fail(`${name} is not listed in the Template Tooling or Project Tooling table of STACK.md`));
const args = install ? ['install', '-g', ...rest.map(pinned)] : [pinned(first), ...rest];
// npm reads a project .npmrc only beside the nearest package.json, which may
// belong to an enclosing project or not exist, and resolves a relative cache
// from the working directory; an absolute cache keeps it under .temp. Windows
// matches variable names in any case, so inherited spellings are dropped.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'npm_config_cache'));
env.npm_config_cache = join(ROOT, '.temp', 'npm-cache');
const run = spawnSync(process.execPath, [join(npmScripts(), install ? 'npm-cli.js' : 'npx-cli.js'), ...args],
  { stdio: 'inherit', env });
if (run.error) fail(run.error.message);
process.exit(run.status ?? 1);
