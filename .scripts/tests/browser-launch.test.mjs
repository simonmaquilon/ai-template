import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fixture } from './browser-fixture.mjs';
import { WINDOWS } from './support.mjs';

// Permissions mean nothing on Windows, and the superuser writes anywhere.
const unprotected = WINDOWS || process.getuid?.() === 0;

test('browser stops before installing when it cannot write its per-user cache', { skip: unprotected }, (t) => {
  const browser = fixture(t);
  const home = join(browser.dir, 'home');
  mkdirSync(home);
  chmodSync(home, 0o500);
  const result = browser(['-s=check', 'open', 'about:blank']);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /cannot write its cache .*agent-browser/);
  assert.match(result.stderr, /inside the client sandbox/);
  assert.match(result.stderr, /alone, from the repository root, .*client's exemption applies, or with the client's approval/);
  assert.match(result.stderr, /\.readme\/91-agent-sandbox\.md/);
  assert.throws(() => browser.npmCalls(), 'npm never ran');
});

test('browser exits with the status of the CLI it ran', (t) => {
  const browser = fixture(t);
  assert.equal(browser(['list']).status, 0);
  writeFileSync(join(browser.npmCalls()[0][0], 'node_modules', 'playwright', 'cli.js'), 'process.exit(3);');
  assert.equal(browser(['list']).status, 3);
});
