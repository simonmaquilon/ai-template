import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { checkArgs } from '../browser-args.mjs';
import { ROOT, WINDOWS, run } from './support.mjs';

const PIN = /^\| `playwright` \| (\d+\.\d+\.\d+) \|/m.exec(readFileSync(join(ROOT, 'STACK.md'), 'utf8'))?.[1];
const refusal = (args) => {
  try {
    checkArgs(args, ROOT);
    return null;
  } catch (error) {
    return error.message;
  }
};

test('browser lets through the commands, options, addresses, and files that only drive the page', () => {
  for (const args of [
    ['-s=check', 'open', 'http://localhost:4173/', '--browser=chrome', '--headed'],
    ['-s', 'check', '--raw', 'eval', '() => document.title'],
    ['--session=check', 'goto', 'https://example.com/a?b=..'],
    ['screenshot', '--full-page', '--filename=.temp/shots/a b.png'],
    ['screenshot', '--filename', 'shot.png', 'e5'],
    ['mousewheel', '0', '-100'],
    ['localstorage-set', 'key', '[{"a":"..","b":"/x"}]'],
    ['state-save', '.temp/state.json'],
    ['video-start', '--size', '800x600', '.temp/a.webm'],
    ['tab-new', 'about:blank'],
    ['--help'],
  ]) assert.equal(refusal(args), null, args.join(' '));
});

test('browser refuses what would run code, install, reach other browsers, sessions, or files, or leave the repository', () => {
  const cases = [
    [['run-code', 'x'], /not an allowed command/], [['install-browser'], /not an allowed command/],
    [['upload', 'a'], /not an allowed command/], [['attach', 'x'], /not an allowed command/],
    [['close-all'], /not an allowed command/], [['kill-all'], /not an allowed command/], [['show'], /not an allowed command/],
    [['--', 'run-code', 'x'], /before "--"/], [['-s=check'], /a command is required/],
    [['open', '--config=a.json'], /--config is not allowed/], [['open', '--profile=.temp/p'], /--profile is not allowed/],
    [['open', '--init-skills-global=claude'], /not allowed/], [['open', '--cdp=http://x'], /not allowed/],
    [['open', '--no-headed'], /not allowed/], [['--no-force', 'install-browser', 'snapshot'], /"install-browser" is not an allowed/],
    [['--no-extension', 'attach', 'snapshot'], /"attach" is not an allowed/], [['--force', 'install-browser', 'snapshot'], /"install-browser" is not an allowed/], [['goto', '--filename=a'], /not allowed here/], [['-g', 'list'], /-g is not allowed/],
    [['open', '--browser=/bin/sh'], /--browser must be one of/],
    [['goto', 'file:///etc/hosts'], /not an http\(s\) address/], [['open', 'chrome://settings'], /not an http/],
    [['tab-new', '--', 'javascript:alert(1)'], /not an http/],
    [['-s=../x', 'list'], /session name/], [['--session', '../../x', 'list'], /session name/],
    [['video-start', '--size', '800x600', '../a.webm'], /not a relative path/],
    [['state-load', '--', '/tmp/state.json'], /not a relative path/],
    [['screenshot', '--filename', '--hires'], /not a relative path/],
  ];
  for (const path of ['/tmp/a.png', '../a.png', 'shots/../../a.png', '~/a.png', 'C:\\a.png', 'a\\..\\..\\b.png']) {
    cases.push([['screenshot', `--filename=${path}`], /not a relative path/], [['pdf', '--filename', path], /not a relative path/]);
  }
  for (const [args, reason] of cases) assert.match(refusal(args) ?? 'accepted', reason, args.join(' '));
});

// A copy of the launcher with its configuration, a home folder of its own, and a stand-in for npm that
// installs a fake Playwright CLI printing where and with what it was launched.
function fixture(t) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.temp', 'browser-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  for (const name of ['browser.mjs', 'browser-args.mjs', 'npm-cli.mjs']) cpSync(join(ROOT, '.scripts', name), join(dir, '.scripts', name));
  cpSync(join(ROOT, 'STACK.md'), join(dir, 'STACK.md'));
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

test('browser installs the pinned playwright once in a per-user cache and runs its cli from the repository root', (t) => {
  assert.ok(PIN, 'STACK.md pins playwright');
  const browser = fixture(t);
  for (const args of [['-s=check', 'open', 'about:blank'], ['list']]) {
    const result = browser(args);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), [browser.dir, 'cli', ...args]);
  }
  const calls = browser.npmCalls();
  assert.equal(calls.length, 1, 'installed only once');
  // A command the installed CLI's own parser would read differently is refused.
  const client = join(calls[0][0], 'node_modules', 'playwright-core', 'lib', 'tools', 'cli-client');
  writeFileSync(join(client, 'minimist.js'), 'exports.minimist = () => ({ _: ["run-code"] });');
  const differs = browser(['list']);
  assert.equal(differs.status, 1);
  assert.equal(differs.stdout, '');
  assert.match(differs.stderr, /does not read the same command/);
  const [cwd, ...args] = calls[0];
  assert.ok(cwd.startsWith(join(browser.dir, 'home')) && cwd.endsWith(join('agent-browser', `playwright-${PIN}`)), cwd);
  assert.deepEqual(args, ['install', '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', `playwright@${PIN}`]);
});

test('browser runs nothing when its arguments or the CLI configuration could take it outside the page', (t) => {
  const browser = fixture(t);
  const refused = (args, reason) => {
    const result = browser(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, reason);
  };
  refused(['run-code', 'x'], /not an allowed command/);
  writeFileSync(join(browser.dir, '.playwright', 'cli.config.json'), '{ "outputDir": ".temp/playwright-cli", "browser": {} }');
  refused(['list'], /must be exactly/);
  if (!WINDOWS) {
    rmSync(join(browser.dir, '.playwright'), { recursive: true });
    mkdirSync(join(browser.dir, 'elsewhere'));
    symlinkSync(join(browser.dir, 'elsewhere'), join(browser.dir, '.playwright'));
    refused(['list'], /is a symbolic link/);
  }
  assert.throws(() => browser.npmCalls(), 'npm never ran');
});

test('the Claude Code sandbox exempts the browser script and nothing broader', () => {
  const excluded = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8')).sandbox.excludedCommands;
  assert.ok(excluded.includes('node .scripts/browser.mjs*'));
  assert.ok(excluded.every((pattern) => pattern.startsWith('node .scripts/')), excluded.join(', '));
});
