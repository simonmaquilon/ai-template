#!/usr/bin/env node
// Runs agent tooling at the version that .agents/tool-versions.json records or, for a
// package it does not list, that the Project Tooling table of .docs/stack.md pins, so
// no command has to carry a version:
//   node .scripts/run-pinned.mjs <package> [args...]      npx <package>@<version> [args...]
//   node .scripts/run-pinned.mjs --install <package>...   npm install -g <package>@<version>...
// npm's own CLI scripts run under this Node without a shell, so every argument
// reaches them literally on every system, and with their cache in .temp/npm-cache
// at the repository root; npm-cli.mjs locates them.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { npmScripts } from './npm-cli.mjs';
import { TOOL_VERSIONS, VERSION, entryProblems, readToolVersions } from './tool-versions-file.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SECTION = 'Project Tooling';
const HEADER = '| Package | Version | License | Origin | Verification |';
const SEPARATOR = /^\|(?: *-{3,} *\|){5}$/;
const PACKAGE = /^`((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)`$/;

function fail(message) {
  console.error(`run-pinned: ${message}`);
  process.exit(1);
}

// The Project Tooling section appears once and holds one table with HEADER, which ends at the first line that is not a
// table row; cells may contain escaped pipes.
function projectVersions() {
  let text;
  try {
    text = readFileSync(join(ROOT, '.docs', 'stack.md'), 'utf8');
  } catch {
    fail('.docs/stack.md is missing');
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const pins = new Map();
  const start = lines.indexOf(`## ${SECTION}`);
  if (start === -1) fail(`.docs/stack.md has no "${SECTION}" section`);
  if (lines.lastIndexOf(`## ${SECTION}`) !== start) fail(`.docs/stack.md has more than one "${SECTION}" section`);
  const next = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  const body = lines.slice(start + 1, next === -1 ? lines.length : next);
  const header = body.indexOf(HEADER);
  if (header === -1 || !SEPARATOR.test(body[header + 1] ?? '')) fail(`the ${SECTION} table of .docs/stack.md is malformed`);
  for (const line of body.slice(header + 2)) {
    if (!line.startsWith('|')) break;
    const cells = line.slice(1, line.endsWith('|') ? -1 : undefined).split(/(?<!\\)\|/).map((cell) => cell.trim());
    const name = PACKAGE.exec(cells[0])?.[1];
    if (cells.length !== 5 || !name) fail(`the ${SECTION} table of .docs/stack.md has a malformed row`);
    if (!VERSION.test(cells[1])) fail(`${name} has no exact version in .docs/stack.md`);
    if (pins.has(name)) fail(`${name} is listed more than once in .docs/stack.md`);
    pins.set(name, cells[1]);
  }
  return pins;
}

// The recorded version of a package, which .agents/tool-versions.json decides before the project's own table, or undefined.
function recordedVersion(name) {
  const { data, error } = readToolVersions(ROOT);
  if (error) fail(error);
  if (!Object.hasOwn(data ?? {}, name)) return undefined;
  const problems = entryProblems(name, data[name]);
  if (problems.length > 0) fail(`${TOOL_VERSIONS} is invalid for ${name} (${problems[0]}); run node .scripts/tool-versions.mjs --check`);
  return data[name].version;
}

const [first, ...rest] = process.argv.slice(2);
const install = first === '--install';
if (first === undefined || (install && rest.length === 0)) {
  fail('usage: run-pinned.mjs <package> [args...] | --install <package>...');
}
let project;
const pinned = (name) => {
  const version = recordedVersion(name) ?? (project ??= projectVersions()).get(name);
  return version ? `${name}@${version}` : fail(`${name} is not listed in ${TOOL_VERSIONS} or the ${SECTION} table of .docs/stack.md`);
};
const args = install ? ['install', '-g', ...rest.map(pinned)] : [pinned(first), ...rest];
// npm reads a project .npmrc only beside the nearest package.json, which may
// belong to an enclosing project or not exist, and resolves a relative cache
// from the working directory; an absolute cache keeps it under .temp. Windows
// matches variable names in any case, so inherited spellings are dropped.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'npm_config_cache'));
env.npm_config_cache = join(ROOT, '.temp', 'npm-cache');
const scripts = npmScripts() ?? fail('npm CLI scripts not found for this Node');
const run = spawnSync(process.execPath, [join(scripts, install ? 'npm-cli.js' : 'npx-cli.js'), ...args],
  { stdio: 'inherit', env });
if (run.error) fail(run.error.message);
process.exit(run.status ?? 1);
