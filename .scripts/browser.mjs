#!/usr/bin/env node
// Runs an agent-operated browser session command through the `cli` of the
// `playwright` package at the version that .agents/tool-versions.json records, from the repository root:
//   node .scripts/browser.mjs [-s=<session>] <command> [args...]
//   node .scripts/browser.mjs [-s=<session>] capture --name <label> <url>... (browser-capture.mjs, run with the same checks)
// The client sandbox cannot start Chromium on macOS, so .claude/settings.json
// exempts this script. Because it runs unconfined, it lets through only the
// command lines browser-args.mjs allows, reads no configuration a confined
// command could have changed beyond the expected .playwright/cli.config.json,
// refuses an install whose integrity hash is not the one that file (protected like
// .scripts) records, and runs Playwright from a per-user cache outside the repository
// and the temporary directory, where confined commands cannot write, installing it
// there with npm from that folder so no project npm configuration applies.

import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkArgs } from './browser-args.mjs';
import { isCapture, planCapture, runCapture, safe } from './browser-capture.mjs';
import { expectedPackages } from './browser-lock.mjs';
import { install as installIn, unwritableCache } from './cache-install.mjs';
import { TOOL_VERSIONS, entryProblems, readToolVersions } from './tool-versions-file.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = { outputDir: '.temp/playwright-cli' };
const CACHE = 'agent-browser';

// What a rejected command line gets told, since it is not for the launcher to run: the launcher section of
// .readme/90-agent-skills.md documents how to run it instead.
const APPROVAL = " Run it through the client's approval instead, as `node .scripts/run-pinned.mjs playwright cli <command>` "
  + '(.readme/90-agent-skills.md, "Lanzador del navegador").';

function fail(message, blocked = true) {
  console.error(`browser: ${message}.${blocked ? APPROVAL : ''}`);
  process.exit(1);
}

const isLink = (path) => lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink();

function checkConfig() {
  const file = join(ROOT, '.playwright', 'cli.config.json');
  for (const path of [dirname(file), file, join(ROOT, '.temp'), join(ROOT, '.temp', 'playwright-cli')]) {
    if (isLink(path)) fail(`${path} is a symbolic link; replace it with a regular file or folder`, false);
  }
  let config;
  try {
    config = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    fail(`.playwright/cli.config.json is missing or not valid JSON; restore it with exactly ${JSON.stringify(CONFIG)}`, false);
  }
  if (JSON.stringify(config) !== JSON.stringify(CONFIG)) fail(`.playwright/cli.config.json must be exactly ${JSON.stringify(CONFIG)}`, false);
}

// The recorded playwright entry, which must be valid; the refresh command that records it runs outside the sandbox.
function pinnedEntry() {
  const { data, error } = readToolVersions(ROOT);
  const problems = error ? [error] : data?.playwright === undefined ? ['it has none'] : entryProblems('playwright', data.playwright);
  if (problems.length > 0) {
    fail(`${TOOL_VERSIONS} holds no valid playwright entry (${problems[0]}); run \`node .scripts/tool-versions.mjs --refresh playwright\` `
      + 'outside the client sandbox, with its approval', false);
  }
  return data.playwright;
}

// The client sandbox denies confined commands the per-user cache, so a launch there cannot install or run anything.
function checkCache() {
  const cache = unwritableCache(CACHE);
  if (cache) {
    fail(`cannot write its cache ${cache}. It is most likely running inside the client sandbox: run it alone, from the `
      + "repository root, so that the client's exemption applies, or with the client's approval (.readme/91-agent-sandbox.md)", false);
  }
}

// Each launch compares what npm recorded for playwright and its recorded dependencies with the record, not the content;
// a mismatch reinstalls.
const install = ({ version, integrity, dependencies }) => installIn({ folder: CACHE, name: 'playwright', version,
  expected: expectedPackages({ version, integrity, dependencies }), fail: (message) => fail(message, false) });

// Reads the arguments again with the installed CLI's own parser and flags, and refuses when it would run
// another command than the one checked, or when that parser is not where this version keeps it.
function sameCommand(dir, args, command) {
  try {
    const client = join(dir, 'node_modules', 'playwright-core', 'lib', 'tools', 'cli-client');
    const require = createRequire(join(client, 'program.js'));
    const { minimist } = require('./minimist.js');
    const boolean = [...require('./help.json').booleanOptions, 'all', 'g', 'help', 'json', 'raw', 'version'];
    if (minimist(args, { boolean, string: ['_'] })._[0] === command) return;
  } catch { /* An unreadable parser fails closed below. */ }
  const problem = "the CLI's own parser does not read the same command";
  if (capturing) throw new Error(problem); // a capture restores the session before it fails
  fail(problem);
}

const args = process.argv.slice(2);
const capturing = isCapture(args);
let plan;
try {
  if (capturing) plan = planCapture(args, ROOT);
  else checkArgs(args, ROOT);
} catch (error) {
  fail(capturing ? safe(error.message) : error.message, !capturing);
}
checkConfig();
checkCache();
const dir = install(pinnedEntry());
const cli = join(dir, 'node_modules', 'playwright', 'cli.js');
// Every command run, those a capture generates included, is checked by browser-args.mjs and read again by the installed CLI.
const launch = (callArgs, options) => {
  sameCommand(dir, callArgs, checkArgs(callArgs, ROOT));
  return spawnSync(process.execPath, [cli, 'cli', ...callArgs], { cwd: ROOT, ...options });
};
if (plan) {
  try {
    runCapture(plan, (callArgs) => launch(callArgs, { encoding: 'utf8', maxBuffer: 1 << 24 }), ROOT);
  } catch (error) {
    fail(safe(error.message), false);
  }
  process.exit(0);
}
const run = launch(args, { stdio: 'inherit' });
if (run.error) fail(run.error.message, false);
process.exit(run.status ?? 1);
