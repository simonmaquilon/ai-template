// A fixture for the capture tests: the launcher fixture with a stand-in for the Playwright CLI that logs every command line
// it gets, answers `eval` from a map of function text to output, and writes the file a `screenshot` names.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAGES } from '../browser-capture-pages.mjs';
import { fixture } from './browser-fixture.mjs';

const FAKE = `const fs = require('fs'), path = require('path');
const args = process.argv.slice(3);
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + '\\n');
const answers = JSON.parse(process.env.FAKE_ANSWERS || '{}');
const command = args.find((arg) => !arg.startsWith('-'));
if (command === process.env.FAKE_FAIL) { console.log(process.env.FAKE_FAIL_TEXT || 'failed'); process.exit(1); }
if (command === 'eval') console.log(answers[args[args.indexOf('eval') + 1]] ?? 'null');
else if (command === 'console') console.log(answers.console ?? 'Total messages: 0 (Errors: 0, Warnings: 0)\\n');
else if (command === 'screenshot') {
  const file = args.find((arg) => arg.startsWith('--filename=')).slice('--filename='.length);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'png');
}`;

// What the page functions answer on a page with nothing to report.
export const QUIET = {
  [PAGES.viewport]: '[1024,768]',
  [PAGES.overflow]: '{"clientWidth":800,"scrollWidth":800,"wide":[],"wideCount":0}',
  [PAGES.clipped]: '{"items":[],"count":0}',
  [PAGES.targets]: '{"items":[],"count":0}',
  [PAGES.focus]: '{"none":true}',
};

// Every file under `dir`, as paths relative to it with "/" separators.
export function tree(dir, base = '') {
  return readdirSync(join(dir, base), { withFileTypes: true }).flatMap((entry) => {
    const path = base ? `${base}/${entry.name}` : entry.name;
    return entry.isDirectory() ? tree(dir, path) : [path];
  });
}

// `capture(args, { answers, env })` runs the launcher; `capture.calls()` are the command lines the CLI got, without "cli".
export function captureFixture(t) {
  const browser = fixture(t);
  assert.equal(browser(['list']).status, 0, 'the first launch installs the stand-in');
  writeFileSync(join(browser.npmCalls()[0][0], 'node_modules', 'playwright', 'cli.js'), FAKE);
  const log = join(browser.dir, 'cli.log');
  const capture = (args, { answers = QUIET, env = {} } = {}) =>
    browser(args, { FAKE_LOG: log, FAKE_ANSWERS: JSON.stringify(answers), ...env });
  capture.dir = browser.dir;
  capture.browser = browser;
  capture.calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []);
  return capture;
}
