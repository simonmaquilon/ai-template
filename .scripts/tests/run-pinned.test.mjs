import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, run } from './support.mjs';

// Reaches the launched process unchanged only when no shell reads it.
const LITERAL = 'a&b|c^d%PATH%"e f';
const HEADER = '| Package | Version | License | Origin | Verification |\n| --- | --- | --- | --- | --- |\n';
const table = (rows) => HEADER + rows.map(([name, version]) => `| \`${name}\` | ${version} | MIT | origin | checked |\n`).join('');
const stack = (template, project = []) =>
  `# Technology Stack\n\n## Template Tooling\n\n${table(template)}\n## Project Tooling\n\n${table(project)}`;
const PIN = /^[a-z-]+@\d+\.\d+\.\d+$/;

// A copy of the script beside a STACK.md and stand-ins for npm's CLI scripts,
// which print the arguments they receive instead of reaching the registry.
function fixture(t, text) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.temp', 'run-pinned-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  mkdirSync(join(dir, '.scripts'));
  mkdirSync(join(dir, 'npm'));
  for (const script of ['run-pinned.mjs', 'npm-cli.mjs']) cpSync(join(ROOT, '.scripts', script), join(dir, '.scripts', script));
  for (const name of ['npm-cli.js', 'npx-cli.js']) {
    writeFileSync(join(dir, 'npm', name),
      `console.log(JSON.stringify([${JSON.stringify(name)}, ...process.argv.slice(2), process.env.npm_config_cache]));\nprocess.exit(Number(process.env.FAKE_STATUS ?? 0));\n`);
  }
  if (text !== undefined) writeFileSync(join(dir, 'STACK.md'), text);
  const pinned = (args, env = {}) => run(process.execPath, [join(dir, '.scripts', 'run-pinned.mjs'), ...args],
    { cwd: join(dir, 'npm'), env: { ...process.env, PINNED_NPM_CLI_DIR: join(dir, 'npm'), ...env } });
  pinned.cache = join(dir, '.temp', 'npm-cache');
  return pinned;
}

test('run-pinned runs a CLI at its pinned version with its arguments unchanged', (t) => {
  const pinned = fixture(t, stack([['skills', '9.0.1']]).replaceAll('\n', '\r\n'));
  const result = pinned(['skills', 'update', '-p', LITERAL]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['npx-cli.js', 'skills@9.0.1', 'update', '-p', LITERAL, pinned.cache]);
  assert.equal(result.stderr, '');
});

test('run-pinned keeps the npm cache in .temp at the repository root whatever the environment says', (t) => {
  const pinned = fixture(t, stack([['skills', '9.0.1']]));
  for (const key of ['npm_config_cache', 'NPM_CONFIG_CACHE']) {
    const result = pinned(['skills'], { [key]: join(ROOT, 'elsewhere') });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).at(-1), pinned.cache, key);
  }
});

test('run-pinned installs packages from both tables globally at their pinned versions', (t) => {
  const text = stack([['typescript', '9.0.2']], [['custom-language-server', '1.2.3']])
    .replace('| origin |', '| a \\| b |');
  const pinned = fixture(t, text);
  const result = pinned(['--install', 'custom-language-server', 'typescript']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),
    ['npm-cli.js', 'install', '-g', 'custom-language-server@1.2.3', 'typescript@9.0.2', pinned.cache]);
});

test('run-pinned reads the pins of the repository STACK.md used by the documented commands', (t) => {
  const pinned = fixture(t, readFileSync(join(ROOT, 'STACK.md'), 'utf8'));
  for (const name of ['skills', 'impeccable']) {
    const [cli, spec] = JSON.parse(pinned([name, '--version']).stdout);
    assert.equal(cli, 'npx-cli.js');
    assert.match(spec, PIN);
    assert.ok(spec.startsWith(`${name}@`), spec);
  }
  const [, , , ...specs] = JSON.parse(pinned(['--install', 'typescript-language-server', 'typescript']).stdout).slice(0, -1);
  assert.deepEqual(specs.map((spec) => spec.split('@')[0]), ['typescript-language-server', 'typescript']);
  for (const spec of specs) assert.match(spec, PIN);
});

test('run-pinned exits with the status of the CLI it runs', (t) => {
  const pinned = fixture(t, stack([['impeccable', '9.0.3']]));
  assert.equal(pinned(['impeccable', 'check'], { FAKE_STATUS: '3' }).status, 3);
});

test('run-pinned refuses invalid input without running anything', (t) => {
  const valid = stack([['skills', '9.0.1']]);
  const fenced = '# Technology Stack\n\n```md\n## Template Tooling\n\n' + table([['skills', '6.6.6']]) + '```\n\n' + valid.slice(19);
  const cases = [
    ['missing STACK.md', undefined, ['skills'], /STACK\.md is missing/],
    ['missing section', '# Technology Stack\n\n## Template Tooling\n\n' + table([['skills', '9.0.1']]), ['skills'], /no "Project Tooling" section/],
    ['repeated section', fenced, ['skills'], /more than one "Template Tooling" section/],
    ['malformed header', valid.replace('| Verification |', ''), ['skills'], /Template Tooling table of STACK\.md is malformed/],
    ['malformed separator', valid.replace('| --- | --- | --- | --- | --- |', '| --- | --- |'), ['skills'], /table of STACK\.md is malformed/],
    ['malformed row', valid.replace('| MIT | origin | checked |', '| MIT | origin |'), ['skills'], /malformed row/],
    ['malformed project table', stack([['skills', '9.0.1']], [['bad name', '1.0.0']]), ['skills'], /Project Tooling table of STACK\.md has a malformed row/],
    ['unlisted package', valid, ['unknown-tool'], /unknown-tool is not listed/],
    ['package in both tables', stack([['skills', '9.0.1']], [['skills', '9.0.4']]), ['skills'], /skills is listed more than once/],
    ['unlisted package to install', stack([['typescript', '9.0.2']]), ['--install', 'typescript', 'unknown-tool'], /unknown-tool is not listed/],
    ['nothing to install', valid, ['--install'], /usage:/],
    ['no package', valid, [], /usage:/],
  ];
  for (const version of ['^9.0.1', 'latest', '9.0', '9.0.1-beta.1', '09.0.1']) {
    cases.push([`version ${version}`, stack([['skills', version]]), ['skills'], /skills has no exact version/]);
  }
  for (const [name, text, args, message] of cases) {
    const result = fixture(t, text)(args);
    assert.equal(result.status, 1, name);
    assert.equal(result.stdout, '', name);
    assert.match(result.stderr, /^run-pinned: /, name);
    assert.match(result.stderr, message, name);
  }
});
