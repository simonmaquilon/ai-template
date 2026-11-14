import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { TOOL_VERSIONS } from '../tool-versions-file.mjs';
import { expectedPackages } from '../browser-lock.mjs';
import { fixture } from './browser-fixture.mjs';

const OTHER = `sha512-${'A'.repeat(86)}==`;
const recorded = (browser) => JSON.parse(readFileSync(join(browser.dir, TOOL_VERSIONS), 'utf8'));
const record = (browser, change) => {
  const data = recorded(browser);
  change(data);
  writeFileSync(join(browser.dir, TOOL_VERSIONS), JSON.stringify(data));
};
const refused = (result, reason) => {
  assert.equal(result.status, 1, result.stdout);
  assert.equal(result.stdout, '', 'the CLI did not run');
  assert.match(result.stderr, reason);
};

test('browser installs the version of .agents/tool-versions.json, whatever .docs/stack.md says', (t) => {
  const browser = fixture(t);
  record(browser, (data) => { data.playwright.version = '9.9.9'; delete data.playwright.hold; delete data.playwright.holdReason; delete data.playwright.dependencies; });
  mkdirSync(join(browser.dir, '.docs'));
  writeFileSync(join(browser.dir, '.docs', 'stack.md'), '## Template Tooling\n\n| `playwright` | 1.0.0 | MIT | origin | checked |\n');
  assert.equal(browser(['list']).status, 0);
  assert.equal(browser.npmCalls()[0].at(-1), 'playwright@9.9.9');
});

test('browser without a valid playwright entry fails and names the refresh command, running nothing', (t) => {
  const browser = fixture(t);
  const refresh = /tool-versions\.mjs --refresh playwright.*outside the client sandbox/;
  record(browser, (data) => { data.playwright.version = '^3.64.0'; });
  refused(browser(['list']), /version is not an exact X\.Y\.Z version.*--refresh playwright/);
  record(browser, (data) => { delete data.playwright; });
  refused(browser(['list']), /holds no valid playwright entry \(it has none\)/);
  writeFileSync(join(browser.dir, TOOL_VERSIONS), '{ not json');
  refused(browser(['list']), refresh);
  rmSync(join(browser.dir, TOOL_VERSIONS));
  refused(browser(['list']), refresh);
  assert.throws(() => browser.npmCalls(), 'npm never ran');
});

test('browser refuses an install whose integrity hash is not the recorded one, and removes the folder', (t) => {
  const browser = fixture(t);
  for (const found of [OTHER, 'none']) {
    refused(browser(['list'], { FAKE_INTEGRITY: found }), found === 'none' ? /no recorded integrity/ : new RegExp(`integrity ${OTHER}, not the sha512-`));
    assert.equal(existsSync(join(browser.npmCalls().at(-1)[0])), false, 'the folder is not left to be trusted');
  }
  assert.equal(browser(['list']).status, 0, 'an install with the recorded hash runs');
});

test('browser does not trust an installed folder whose hash is no longer the recorded one', (t) => {
  const browser = fixture(t);
  assert.equal(browser(['list']).status, 0);
  record(browser, (data) => { data.playwright.integrity = OTHER; });
  refused(browser(['list']), /not the sha512-A+==/);
  assert.equal(browser.npmCalls().length, 2, 'it reinstalled instead of running the folder');
});

test('browser refuses an install whose recorded dependency has another integrity, is missing or is another version', (t) => {
  const browser = fixture(t);
  for (const [env, reason] of [[{ FAKE_DEP_INTEGRITY: OTHER }, new RegExp(`playwright-core@\\S+ with integrity ${OTHER}, not the sha512-`)],
    [{ FAKE_DEP_INTEGRITY: 'none' }, /playwright-core@\S+ with no recorded integrity/]]) {
    refused(browser(['list'], env), reason);
    assert.equal(existsSync(join(browser.npmCalls().at(-1)[0])), false, 'the folder is not left to be trusted');
  }
  record(browser, (data) => { data.playwright.dependencies['playwright-core'].version = '9.9.9'; });
  refused(browser(['list']), /playwright-core@\S+ with integrity sha512-.*, not the sha512-/);
  record(browser, (data) => { delete data.playwright.dependencies; });
  assert.equal(browser(['list']).status, 0, 'without a recorded dependency only its version is compared');
  assert.equal(browser.npmCalls().length, 4, 'each mismatch reinstalled once, and the last launch found the folder ready');
});

test('browser reinstalls once when the dependencies of an installed folder are recorded differently afterwards', (t) => {
  const browser = fixture(t);
  assert.equal(browser(['list']).status, 0);
  record(browser, (data) => { data.playwright.dependencies['playwright-core'].integrity = OTHER; });
  refused(browser(['list']), /playwright-core@\S+ with integrity sha512-.*, not the sha512-A+==/);
  assert.equal(browser.npmCalls().length, 2, 'one installation, then one reinstallation, not a loop');
  assert.equal(browser(['list'], { FAKE_DEP_INTEGRITY: OTHER }).status, 0, 'a folder that matches the new record is used');
  assert.equal(browser.npmCalls().length, 3);
  assert.equal(browser(['list'], { FAKE_DEP_INTEGRITY: OTHER }).status, 0);
  assert.equal(browser.npmCalls().length, 3, 'and then it is not reinstalled');
});

test('no dependency can stand for the package itself, in the file or in what the launcher expects', (t) => {
  const own = { version: '9.9.9', integrity: OTHER };
  const expected = expectedPackages({ version: '1.0.0', integrity: `sha512-${'B'.repeat(86)}==`, dependencies: { playwright: own, extra: own } });
  assert.deepEqual(expected.playwright, { version: '1.0.0', integrity: `sha512-${'B'.repeat(86)}==` });
  const browser = fixture(t);
  record(browser, (data) => { data.playwright.dependencies.playwright = { version: '9.9.9', integrity: OTHER }; });
  refused(browser(['list']), /dependencies\.playwright is the package itself/);
  assert.throws(() => browser.npmCalls(), 'npm never ran');
});

test('browser fails closed when npm left a nested copy of a recorded package, which Node would load', (t) => {
  const browser = fixture(t);
  for (const nested of ['playwright-core', 'playwright']) {
    refused(browser(['list'], { FAKE_NESTED: `node_modules/other/node_modules/${nested}` }), new RegExp(`a copy of ${nested} at node_modules/other/node_modules/${nested}`));
    assert.equal(existsSync(join(browser.npmCalls().at(-1)[0])), false, 'the folder is removed');
  }
  assert.equal(browser(['list']).status, 0);
});
