// A fixture for the launcher tests: a copy of the launcher under .temp/ run against a stand-in for npm.

import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOL_VERSIONS } from '../tool-versions-file.mjs';
import { ROOT, run } from './support.mjs';

// A copy of the launcher with its configuration and the tool versions file, a home folder of its own, and a stand-in for
// npm that installs a fake Playwright CLI printing where and with what it was launched, and records the integrity hash
// of the entry and of its dependency (FAKE_INTEGRITY and FAKE_DEP_INTEGRITY replace them, and "none" leaves one out).
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
  const browserScripts = readdirSync(join(ROOT, '.scripts')).filter((name) => /^browser.*\.mjs$/.test(name));
  for (const name of [...browserScripts, 'cache-install.mjs', 'npm-cli.mjs', 'tool-versions-file.mjs']) cpSync(join(ROOT, '.scripts', name), join(dir, '.scripts', name));
  cpSync(join(ROOT, TOOL_VERSIONS), join(dir, TOOL_VERSIONS));
  const { integrity, dependencies } = JSON.parse(readFileSync(join(ROOT, TOOL_VERSIONS), 'utf8')).playwright;
  cpSync(join(ROOT, '.playwright'), join(dir, '.playwright'), { recursive: true });
  mkdirSync(join(dir, 'npm'));
  writeFileSync(join(dir, 'npm', 'npm-cli.js'), `const fs = require('fs'), path = require('path');
fs.appendFileSync(${JSON.stringify(join(dir, 'npm.log'))}, JSON.stringify([process.cwd(), ...process.argv.slice(2)]) + '\\n');
const version = process.argv.at(-1).split('@').at(-1);
for (const name of ['playwright', 'playwright-core']) {
  fs.mkdirSync(path.join('node_modules', name), { recursive: true });
  fs.writeFileSync(path.join('node_modules', name, 'package.json'), JSON.stringify({ name, version }));
}
const integrity = process.env.FAKE_INTEGRITY === 'none' ? undefined : process.env.FAKE_INTEGRITY ?? ${JSON.stringify(integrity)};
const depIntegrity = process.env.FAKE_DEP_INTEGRITY === 'none' ? undefined : process.env.FAKE_DEP_INTEGRITY ?? ${JSON.stringify(dependencies['playwright-core'].integrity)};
fs.writeFileSync(path.join('node_modules', '.package-lock.json'), JSON.stringify({ packages: { 'node_modules/playwright': { version, integrity },
  'node_modules/playwright-core': { version, integrity: depIntegrity },
  ...(process.env.FAKE_NESTED ? { [process.env.FAKE_NESTED]: { version, integrity } } : {}) } }));
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
  const browser = (args, extra = {}) => run(process.execPath, [join(dir, '.scripts', 'browser.mjs'), ...args], { cwd: join(dir, 'npm'), env: { ...env, ...extra } });
  browser.dir = dir;
  browser.npmCalls = () => readFileSync(join(dir, 'npm.log'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  return browser;
}
