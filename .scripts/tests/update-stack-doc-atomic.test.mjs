// The sync replaces .docs/stack.md by renaming a finished copy over it, so a concurrent reader never sees it empty or
// half written, and it writes nothing when another writer changed the document after the sync read it.

import assert from 'node:assert/strict';
import { chmodSync, existsSync, lutimesSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS } from './support.mjs';
import { fixture } from './stack-fixture.mjs';

const docs = (repo) => readdirSync(join(repo.dir, '.docs'));
const stackPath = (repo) => JSON.stringify(join(repo.dir, '.docs', 'stack.md'));
// Patches fs.openSync so `step` runs once, when the sync opens its temporary copy for writing.
const atTemporaryCopy = (step) => `
const open = fs.openSync;
let fired = false;
fs.openSync = (path, ...rest) => {
  if (!fired && String(path).includes('stack.md') && (rest[0] & 3) === 1) {
    fired = true;
    ${step}
  }
  return open(path, ...rest);
};`;

test('update-stack-doc writes nothing when stack.md changed after it was read, and the next run syncs', (t) => {
  const repo = fixture(t);
  const concurrent = `${repo.stack()}\nWritten by someone else.\n`;
  const result = repo.syncWith(atTemporaryCopy(`fs.writeFileSync(${stackPath(repo)}, ${JSON.stringify(concurrent)});`));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(repo.stack(), concurrent);
  assert.deepEqual(docs(repo), ['stack.md']);
  assert.match(repo.sync().stdout, /synced .*runtime/);
  assert.ok(repo.stack().includes('Written by someone else.'));
  assert.doesNotMatch(repo.stack(), /\nstale\n/);
});

test('update-stack-doc leaves no temporary file and the old document when the replacement fails', (t) => {
  const repo = fixture(t);
  const before = repo.stack();
  const result = repo.syncWith(`fs.renameSync = () => { throw Object.assign(new Error('Injected failure'), { code: 'EACCES' }); };`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /not synced.*EACCES/);
  assert.equal(repo.stack(), before);
  assert.deepEqual(docs(repo), ['stack.md']);
});

test('update-stack-doc leaves alone a file it did not create where its temporary copy would go', (t) => {
  const repo = fixture(t);
  const before = repo.stack();
  const result = repo.syncWith(atTemporaryCopy(`fs.writeFileSync(path, 'not mine');`));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /not synced.*EEXIST/);
  assert.equal(repo.stack(), before);
  const [foreign, ...rest] = docs(repo).filter((name) => name !== 'stack.md');
  assert.deepEqual(rest, []);
  assert.match(foreign, /^\.stack\.md\.sync-\d+$/);
  assert.equal(readFileSync(join(repo.dir, '.docs', foreign), 'utf8'), 'not mine');
});

test('update-stack-doc leaves no temporary file after a successful sync', (t) => {
  const repo = fixture(t);
  assert.match(repo.sync().stdout, /synced/);
  assert.deepEqual(docs(repo), ['stack.md']);
});

// A reader running at each step of the write sees the old document or the new one, never an empty or partial file.
test('update-stack-doc never exposes stack.md empty or partly written', (t) => {
  const repo = fixture(t);
  const before = repo.stack();
  const dump = join(repo.dir, '.temp', 'seen.json');
  const result = repo.syncWith(`
const seen = [];
const look = () => seen.push(fs.readFileSync(${stackPath(repo)}, 'utf8'));
for (const name of ['ftruncateSync', 'writeSync', 'writeFileSync', 'renameSync']) {
  const original = fs[name];
  fs[name] = (...args) => {
    if (name === 'renameSync') look();
    const value = original(...args);
    if (name !== 'renameSync') look();
    return value;
  };
}
process.on('exit', () => fs.writeFileSync(${JSON.stringify(dump)}, JSON.stringify(seen)));`);
  assert.equal(result.status, 0, result.stderr);
  const seen = JSON.parse(readFileSync(dump, 'utf8'));
  assert.ok(seen.length > 0);
  const after = repo.stack();
  assert.notEqual(after, before);
  for (const text of seen) assert.ok(text === before || text === after, `observed ${text.length} bytes`);
});

test('update-stack-doc keeps the byte order mark and the line endings', (t) => {
  const repo = fixture(t);
  repo.write('.docs/stack.md', `﻿${repo.stack().replaceAll('\n', '\r\n')}`);
  assert.match(repo.sync().stdout, /synced/);
  const stack = repo.stack();
  assert.ok(stack.startsWith('﻿# Technology Stack\r\n'));
  assert.doesNotMatch(stack, /(?<!\r)\n/);
  assert.ok(stack.includes('| package.json engines.node | >=22 |'));
});

test('update-stack-doc keeps the mode of the document', { skip: WINDOWS }, (t) => {
  const repo = fixture(t);
  chmodSync(join(repo.dir, '.docs', 'stack.md'), 0o640);
  assert.match(repo.sync().stdout, /synced/);
  assert.equal(statSync(join(repo.dir, '.docs', 'stack.md')).mode & 0o777, 0o640);
});

// A process that died before renaming leaves `.stack.md.sync-<pid>`; a sync removes it once it is over a minute old.
const left = (repo, name, seconds, make = () => repo.write(`.docs/${name}`, 'left by a dead process')) => {
  make(join(repo.dir, '.docs', name));
  lutimesSync(join(repo.dir, '.docs', name), new Date(Date.now() - seconds * 1000), new Date(Date.now() - seconds * 1000));
};

test('update-stack-doc removes the temporary copy a dead process left more than a minute ago', (t) => {
  const repo = fixture(t);
  left(repo, '.stack.md.sync-4242', 120);
  assert.match(repo.sync().stdout, /synced/);
  assert.deepEqual(docs(repo), ['stack.md']);
});

test('update-stack-doc keeps what is not an old temporary copy of stack.md: recent, linked, a folder, or another name', (t) => {
  const repo = fixture(t);
  left(repo, '.stack.md.sync-4242', 10);
  for (const name of ['.stack.md.sync-abc', '.stack.md.sync-', '.stack.md.bak-4242', '.stack.md.sync-4242.old', 'stack.md.sync-4242', '.other.md.sync-4242']) left(repo, name, 3600);
  left(repo, '.stack.md.sync-77', 3600, mkdirSync);
  if (!WINDOWS) {
    left(repo, 'target.md', 3600);
    left(repo, '.stack.md.sync-88', 3600, (path) => symlinkSync('target.md', path));
  }
  const before = docs(repo);
  assert.match(repo.sync().stdout, /synced/);
  assert.deepEqual(docs(repo), before);
});

test('update-stack-doc still syncs when an old temporary copy cannot be removed', (t) => {
  const repo = fixture(t);
  left(repo, '.stack.md.sync-4242', 120);
  const result = repo.syncWith(`for (const name of ['rmSync', 'unlinkSync']) {
  const original = fs[name];
  fs[name] = (path, ...rest) => {
    if (String(path).includes('sync-4242')) throw Object.assign(new Error('Injected'), { code: 'EACCES' });
    return original(path, ...rest);
  };
}`);
  assert.match(result.stdout, /synced/);
  assert.ok(existsSync(join(repo.dir, '.docs', '.stack.md.sync-4242')));
  assert.doesNotMatch(repo.stack(), /\nstale\n/);
});
