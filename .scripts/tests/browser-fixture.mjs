// A fixture for the launcher tests: a copy of the launcher under .temp/ run against a stand-in for npm.

import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, run } from './support.mjs';

// A copy of the launcher with its configuration, a home folder of its own, and a stand-in for npm that
// installs a fake Playwright CLI printing where and with what it was launched.
export function fixture(t) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.temp', 'browser-'));
  // Hooks run in the order they were added, so a test that takes its home folder's permissions away cannot restore
  // them in a hook of its own before this one removes the folder.
  t.after(() => {
    try {
      chmodSync(join(dir, 'home'), 0o700);
    } catch {
      // The folder was never made.
    }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  });
  for (const name of ['browser.mjs', 'browser-args.mjs', 'npm-cli.mjs']) cpSync(join(ROOT, '.scripts', name), join(dir, '.scripts', name));
  cpSync(join(ROOT, '.docs', 'stack.md'), join(dir, '.docs', 'stack.md'));
  cpSync(join(ROOT, '.playwright'), join(dir, '.playwright'), { recursive: true });
  mkdirSync(join(dir, 'npm'));
  writeFileSync(join(dir, 'npm', 'npm-cli.js'), `const fs = require('fs'), path = require('path');
fs.appendFileSync(${JSON.stringify(join(dir, 'npm.log'))}, JSON.stringify([process.cwd(), ...process.argv.slice(2)]) + '\\n');
const version = process.argv.at(-1).split('@').at(-1);
for (const name of ['playwright', 'playwright-core']) {
  fs.mkdirSync(path.join('node_modules', name), { recursive: true });
  fs.writeFileSync(path.join('node_modules', name, 'package.json'), JSON.stringify({ name, version }));
}
fs.writeFileSync(path.join('node_modules', 'playwright', 'cli.js'), 'console.log(JSON.stringify([process.cwd(), ...process.argv.slice(2)]))');
const client = path.join('node_modules', 'playwright-core', 'lib', 'tools', 'cli-client');
fs.mkdirSync(client, { recursive: true });
fs.writeFileSync(path.join(client, 'help.json'), '{ "booleanOptions": [] }');
fs.writeFileSync(path.join(client, 'minimist.js'), 'exports.minimist = (args) => ({ _: args.filter((arg) => !arg.startsWith("-")) });');
`);
  writeFileSync(join(dir, 'npm', 'npx-cli.js'), '');
  // The stand-ins are CommonJS whatever package.json encloses the repository.
  writeFileSync(join(dir, 'npm', 'package.json'), '{ "type": "commonjs" }\n');
  const home = join(dir, 'home');
  const env = { ...process.env, PINNED_NPM_CLI_DIR: join(dir, 'npm'), HOME: home, USERPROFILE: home,
    LOCALAPPDATA: join(home, 'local'), XDG_CACHE_HOME: join(home, 'cache') };
  const browser = (args) => run(process.execPath, [join(dir, '.scripts', 'browser.mjs'), ...args], { cwd: join(dir, 'npm'), env });
  browser.dir = dir;
  browser.npmCalls = () => readFileSync(join(dir, 'npm.log'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  return browser;
}
