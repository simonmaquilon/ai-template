import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { PIN, fixture, stack, tools } from './run-pinned-fixture.mjs';
import { ROOT } from './support.mjs';

// Reaches the launched process unchanged only when no shell reads it.
const LITERAL = 'a&b|c^d%PATH%"e f';

test('run-pinned runs a CLI at its recorded version with its arguments unchanged', (t) => {
  const pinned = fixture(t, undefined, tools([['skills', '9.0.1']]));
  const result = pinned(['skills', 'update', '-p', LITERAL]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['npx-cli.js', 'skills@9.0.1', 'update', '-p', LITERAL, pinned.cache]);
  assert.equal(result.stderr, '');
});

test('run-pinned runs a package of Project Tooling at its pinned version, read from a file with CRLF line ends', (t) => {
  const pinned = fixture(t, stack([['custom-cli', '9.0.5']]).replaceAll('\n', '\r\n'), tools([['skills', '9.0.1']]));
  const result = pinned(['custom-cli', 'check']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['npx-cli.js', 'custom-cli@9.0.5', 'check', pinned.cache]);
});

test('run-pinned keeps the npm cache in .temp at the repository root whatever the environment says', (t) => {
  const pinned = fixture(t, undefined, tools([['skills', '9.0.1']]));
  for (const key of ['npm_config_cache', 'NPM_CONFIG_CACHE']) {
    const result = pinned(['skills'], { [key]: join(ROOT, 'elsewhere') });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).at(-1), pinned.cache, key);
  }
});

test('run-pinned installs packages of the file and of Project Tooling globally at their pinned versions', (t) => {
  const text = stack([['custom-language-server', '1.2.3']]).replace('| origin |', '| a \\| b |');
  const pinned = fixture(t, text, tools([['typescript', '9.0.2']]));
  const result = pinned(['--install', 'custom-language-server', 'typescript']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),
    ['npm-cli.js', 'install', '-g', 'custom-language-server@1.2.3', 'typescript@9.0.2', pinned.cache]);
});

test('run-pinned takes a package that both list from the file, which a confined command cannot edit', (t) => {
  const pinned = fixture(t, stack([['skills', '9.0.4']]), tools([['skills', '9.0.1']]));
  assert.equal(JSON.parse(pinned(['skills']).stdout)[1], 'skills@9.0.1');
});

test('run-pinned needs no .docs/stack.md for a package of the file', (t) => {
  assert.equal(JSON.parse(fixture(t, undefined, tools([['skills', '9.0.1']]))(['skills']).stdout)[1], 'skills@9.0.1');
});

test('run-pinned reads the versions of the repository files used by the documented commands', (t) => {
  const pinned = fixture(t, readFileSync(join(ROOT, '.docs', 'stack.md'), 'utf8'), readFileSync(join(ROOT, '.agents', 'tool-versions.json'), 'utf8'));
  const recorded = JSON.parse(readFileSync(join(ROOT, '.agents', 'tool-versions.json'), 'utf8'));
  const [cli, spec] = JSON.parse(pinned(['skills', '--version']).stdout);
  assert.equal(cli, 'npx-cli.js');
  assert.equal(spec, `skills@${recorded.skills.version}`);
  const [, , , ...specs] = JSON.parse(pinned(['--install', 'typescript-language-server', 'typescript']).stdout).slice(0, -1);
  assert.deepEqual(specs, [`typescript-language-server@${recorded['typescript-language-server'].version}`, `typescript@${recorded.typescript.version}`]);
  for (const found of [spec, ...specs]) assert.match(found, PIN);
});

test('run-pinned exits with the status of the CLI it runs', (t) => {
  const pinned = fixture(t, stack([['example-cli', '9.0.3']]));
  assert.equal(pinned(['example-cli', 'check'], { FAKE_STATUS: '3' }).status, 3);
});
