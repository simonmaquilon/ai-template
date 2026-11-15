// A fixture for the mobile-server tests: a copy of the launcher under .temp/ run against a stand-in for npm, written in
// Node so that it runs the same on every system, that installs a fake appium-mcp (mobile-server-fake.cjs) in place of
// the real server, and a home folder of its own where the launcher keeps its cache.

import { spawn } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOL_VERSIONS } from '../tool-versions-file.mjs';
import { ROOT, run } from './support.mjs';

export const INTEGRITY = `sha512-${'C'.repeat(86)}==`;
export const OTHER = `sha512-${'A'.repeat(86)}==`;
export const VERSION = '1.2.3';
const ENTRY = { version: VERSION, integrity: INTEGRITY, published: '2026-10-01T00:00:00.000Z', resolved: '2026-11-01T00:00:00.000Z',
  repository: 'https://github.com/appium/appium-mcp', license: 'Apache-2.0' };

// The fake npm installs appium-mcp with the version and the integrity hash that FAKE_INTEGRITY names (the recorded one
// by default), its `bin` as FAKE_BIN says (a JSON value), the server at dist/index.js (a link to dist/real.js with
// FAKE_LINK), and a package `dep-pkg` with the hash OTHER.
const NPM = (dir) => `const fs = require('fs'), path = require('path');
fs.appendFileSync(${JSON.stringify(join(dir, 'npm.log'))}, JSON.stringify([process.cwd(), ...process.argv.slice(2)]) + '\\n');
const version = process.argv.at(-1).split('@').at(-1);
const pkg = path.join('node_modules', 'appium-mcp');
fs.mkdirSync(path.join(pkg, 'dist'), { recursive: true });
const bin = process.env.FAKE_BIN ? JSON.parse(process.env.FAKE_BIN) : 'dist/index.js';
fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'appium-mcp', version, bin }));
const server = path.join(pkg, 'dist', process.env.FAKE_LINK ? 'real.js' : 'index.js');
fs.copyFileSync(${JSON.stringify(join(ROOT, '.scripts', 'tests', 'mobile-server-fake.cjs'))}, server);
if (process.env.FAKE_LINK) fs.symlinkSync('real.js', path.join(pkg, 'dist', 'index.js'));
fs.writeFileSync(path.join('node_modules', '.package-lock.json'), JSON.stringify({ packages: {
  'node_modules/appium-mcp': { version, integrity: process.env.FAKE_INTEGRITY ?? ${JSON.stringify(INTEGRITY)} },
  'node_modules/dep-pkg': { version: '4.5.6', integrity: ${JSON.stringify(OTHER)} } } }));
`;

export const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
// Whether the process has gone within ten seconds.
export const gone = async (pid) => {
  for (let wait = 0; wait < 100 && alive(pid); wait++) await new Promise((resolve) => setTimeout(resolve, 100));
  return !alive(pid);
};

// The launcher as a function of its arguments and extra environment, with .dir, .npmCalls() and .start(args, env), which
// starts it without waiting and returns the child with .waitFor(pattern), a promise of the first stderr text that matches.
export function fixture(t, entry = ENTRY) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.temp', 'mobile-'));
  const children = [];
  // Hooks run in the order they were added, so permissions are restored before the folder is removed.
  t.after(() => {
    for (const child of children) child.kill();
    try {
      chmodSync(join(dir, 'home'), 0o700);
    } catch {
      // The folder was never made.
    }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  });
  const names = readdirSync(join(ROOT, '.scripts')).filter((name) => /^mobile-server.*\.mjs$/.test(name));
  for (const name of [...names, 'browser-lock.mjs', 'cache-install.mjs', 'npm-cli.mjs', 'tool-versions-file.mjs']) {
    cpSync(join(ROOT, '.scripts', name), join(dir, '.scripts', name));
  }
  mkdirSync(join(dir, '.agents'));
  writeFileSync(join(dir, TOOL_VERSIONS), JSON.stringify({ 'appium-mcp': entry }));
  mkdirSync(join(dir, 'npm'));
  writeFileSync(join(dir, 'npm', 'npm-cli.js'), NPM(dir));
  writeFileSync(join(dir, 'npm', 'npx-cli.js'), '');
  // The stand-ins are CommonJS whatever package.json encloses the repository.
  writeFileSync(join(dir, 'npm', 'package.json'), '{ "type": "commonjs" }\n');
  const home = join(dir, 'home');
  const env = { ...process.env, PINNED_NPM_CLI_DIR: join(dir, 'npm'), HOME: home, USERPROFILE: home,
    LOCALAPPDATA: join(home, 'local'), XDG_CACHE_HOME: join(home, 'cache') };
  const script = join(dir, '.scripts', 'mobile-server.mjs');
  const launcher = (args = [], extra = {}, input) => run(process.execPath, [script, ...args], { cwd: dir, env: { ...env, ...extra }, input });
  launcher.dir = dir;
  launcher.npmCalls = () => readFileSync(join(dir, 'npm.log'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  launcher.start = (args = [], extra = {}) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: dir, env: { ...env, ...extra }, stdio: ['pipe', 'pipe', 'pipe'] });
    children.push(child);
    let seen = '';
    const waiting = [];
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      seen += chunk;
      for (const wait of waiting) wait();
    });
    child.waitFor = (pattern) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${pattern} on stderr: ${seen}`)), 30_000);
      const check = () => {
        const found = pattern.exec(seen);
        if (found) {
          clearTimeout(timer);
          resolve(found);
        }
      };
      waiting.push(check);
      check();
    });
    return child;
  };
  return launcher;
}
