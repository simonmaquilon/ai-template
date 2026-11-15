import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { TOOL_VERSIONS } from '../tool-versions-file.mjs';
import { INTEGRITY, OTHER, VERSION, fixture } from './mobile-server-fixture.mjs';
import { WINDOWS } from './support.mjs';

const record = (mobile, change) => {
  const path = join(mobile.dir, TOOL_VERSIONS);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  change(data['appium-mcp']);
  writeFileSync(path, JSON.stringify(data));
};
// Starts the launcher with a line on stdin, which the fake server echoes.
const ran = (mobile, env = {}) => {
  const result = mobile([], env, 'hello\n');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'echo:hello\n');
};
const notRun = (mobile, env, reason) => {
  const result = mobile([], env, 'hello\n');
  assert.equal(result.status, 1, result.stdout);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, reason);
  assert.doesNotMatch(result.stderr, /ready \d+/, 'the server did not start');
};

test('mobile-server installs the recorded version in a per-user cache and reuses it without installing again', (t) => {
  const mobile = fixture(t);
  ran(mobile);
  const [[cwd, ...args]] = mobile.npmCalls();
  assert.ok(cwd.startsWith(join(mobile.dir, 'home')) && cwd.endsWith(join('agent-mobile', `appium-mcp-${VERSION}`)), cwd);
  assert.deepEqual(args, ['install', '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', `appium-mcp@${VERSION}`]);
  ran(mobile);
  assert.equal(mobile.npmCalls().length, 1, 'the second start found the cache ready');
});

test('mobile-server installs the version the record names, not a fixed one', (t) => {
  const mobile = fixture(t);
  record(mobile, (entry) => { entry.version = '9.9.9'; });
  assert.equal(mobile(['--check']).status, 0);
  assert.equal(mobile.npmCalls()[0].at(-1), 'appium-mcp@9.9.9');
});

test('mobile-server reinstalls when the installed integrity is not the recorded one, and uses what then matches', (t) => {
  const mobile = fixture(t);
  ran(mobile);
  record(mobile, (entry) => { entry.integrity = OTHER; });
  ran(mobile, { FAKE_INTEGRITY: OTHER });
  assert.equal(mobile.npmCalls().length, 2, 'one reinstall');
  ran(mobile, { FAKE_INTEGRITY: OTHER });
  assert.equal(mobile.npmCalls().length, 2, 'and then the cache is ready');
});

test('mobile-server removes the folder and runs nothing when the new install is not the recorded one either', (t) => {
  const mobile = fixture(t);
  ran(mobile);
  record(mobile, (entry) => { entry.integrity = OTHER; });
  notRun(mobile, {}, new RegExp(`appium-mcp@${VERSION} with integrity ${INTEGRITY}, not the ${OTHER} that .*tool-versions.*records; the folder was removed and nothing ran`));
  assert.equal(mobile.npmCalls().length, 2);
  assert.equal(existsSync(mobile.npmCalls().at(-1)[0]), false, 'the folder is not left to be trusted');
  notRun(mobile, { FAKE_INTEGRITY: 'bad' }, /appium-mcp@1\.2\.3 with integrity bad, not the sha512-A+==/);
  assert.equal(mobile.npmCalls().length, 3, 'each start installs again, never running the folder');
});

test('mobile-server compares the recorded dependencies too, and a mismatch reinstalls', (t) => {
  const mobile = fixture(t);
  record(mobile, (entry) => { entry.dependencies = { 'dep-pkg': { version: '4.5.6', integrity: OTHER } }; });
  ran(mobile);
  record(mobile, (entry) => { entry.dependencies['dep-pkg'].integrity = INTEGRITY; });
  notRun(mobile, {}, /dep-pkg@4\.5\.6 with integrity sha512-A+=*, not the sha512-C+=* that/);
  assert.equal(mobile.npmCalls().length, 2);
});

const BAD = [['a path with ..', '"../../outside.js"'], ['a path that returns through ..', '"dist/../../outside.js"'], ['an absolute path', JSON.stringify(join(process.cwd(), 'x.js'))],
  ['a root path', '"/dist/index.js"'], ['a drive path', '"C:\\\\x.js"'], ['a drive-relative path', '"C:x.js"'], ['a backslash path with ..', '"..\\\\x.js"'],
  ['an empty path', '""'], ['no bin for the package', '{ "other": "dist/index.js" }'], ['a bin of another type', '7'], ['a folder', '"dist"'], ['a missing file', '"dist/none.js"']];
for (const [title, bin] of BAD) {
  test(`mobile-server refuses a bin that is ${title}, and runs nothing`, (t) => {
    const mobile = fixture(t);
    notRun(mobile, { FAKE_BIN: bin }, /the bin of appium-mcp.*(not a path inside its package \(.*\)|is not a regular file); nothing ran/s);
  });
}

test('mobile-server refuses a bin that is a symbolic link, and runs nothing', { skip: WINDOWS && 'symbolic links need a privilege that Windows runners and people may not have' }, (t) => {
  const mobile = fixture(t);
  notRun(mobile, { FAKE_LINK: '1' }, /index\.js, is not a regular file; nothing ran/);
});

test('mobile-server runs the bin whether it is written as a string, as an object or with a leading ./', (t) => {
  for (const bin of ['"dist/index.js"', '{ "appium-mcp": "dist/index.js" }', '"./dist/index.js"']) ran(fixture(t), { FAKE_BIN: bin });
});

test('mobile-server stops before installing when it cannot write its per-user cache', { skip: (WINDOWS || process.getuid?.() === 0) && 'permissions mean nothing on Windows, and the superuser writes anywhere' }, (t) => {
  const mobile = fixture(t);
  mkdirSync(join(mobile.dir, 'home'));
  chmodSync(join(mobile.dir, 'home'), 0o500);
  const result = mobile(['--check']);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /cannot write its cache .*agent-mobile/);
  assert.match(result.stderr, /inside the client sandbox.*outside it, with the client's approval \(\.readme\/91-agent-sandbox\.md\)/);
  assert.throws(() => mobile.npmCalls(), 'npm never ran');
});
