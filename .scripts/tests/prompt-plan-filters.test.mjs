// What prompt-plan's patch scripts do with files that a clean filter changes on their way into a snapshot: where the
// filter loses bytes, such as one that redacts a password, a file can hash like a recorded state although its bytes
// differ, so restore, revert, and apply refuse to overwrite it, naming it and leaving it as it is, whatever the driver is
// called; a filter that keeps every byte is no obstacle, and neither is a bare filter attribute, which runs no driver.
// The files git converts, with or without a driver that changes nothing, are in prompt-plan-converted.test.mjs.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
const refused = (result, pattern) => {
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, pattern);
  assert.doesNotMatch(result.stderr, /^\s+at /m, 'the refusal carries a stack trace');
};
const NEEDS_SED = { skip: WINDOWS && 'the clean filter needs sed' };
const HIDES = /filter[\s\S]*hides[\s\S]*overwrite[\s\S]*\n {2}app\.conf$/m;

const REDACT = "sed 's/^password=.*/password=REDACTED/'";

// app.conf as git stores it, with its password redacted by the clean filter that .gitattributes names.
function setUp(t, clean = REDACT, driver = 'redact', attribute = `filter=${driver}`) {
  const repo = startRepo(t, { 'kept.txt': 'before\n', 'app.conf': 'password=REDACTED\nname=a\n', '.gitattributes': `app.conf ${attribute}\n` });
  ok(repo.git('config', `filter.${driver}.clean`, clean));
  const read = (path) => readFileSync(join(repo.dir, path), 'utf8');
  return { repo, read, ...patchPlan(repo, ['01']) };
}

test('prompt-plan filters: restore refuses a file whose bytes a lossy clean filter hides, and leaves it as it is', NEEDS_SED, (t) => {
  const { repo, read, patch } = setUp(t);
  repo.write('app.conf', 'password=hunter2\nname=a\n');
  ok(patch('record', '01', 'before'));
  repo.write('app.conf', 'password=hunter2\nname=b\n');
  refused(patch('record', '01', 'restore'), HIDES);
  assert.equal(read('app.conf'), 'password=hunter2\nname=b\n');
});

test('prompt-plan filters: revert refuses such a file too, writing nothing', NEEDS_SED, (t) => {
  const { repo, read, patch } = setUp(t);
  repo.write('app.conf', 'password=hunter2\nname=a\n');
  ok(patch('record', '01', 'before'));
  repo.write('app.conf', 'password=hunter2\nname=b\n');
  ok(patch('record', '01', 'after'));
  refused(patch('revert', '01'), HIDES);
  assert.equal(read('app.conf'), 'password=hunter2\nname=b\n');
});

test('prompt-plan filters: apply refuses such a file too, writing nothing', NEEDS_SED, (t) => {
  const { repo, read, patch } = setUp(t);
  ok(patch('record', '01', 'before'));
  repo.write('app.conf', 'password=REDACTED\nname=b\n');
  ok(patch('record', '01', 'after'));
  ok(patch('revert', '01'));
  // The secret is back on disk at the before state, which the filter hides from the comparison with the record.
  repo.write('app.conf', 'password=hunter2\nname=a\n');
  refused(patch('apply', '01'), HIDES);
  assert.equal(read('app.conf'), 'password=hunter2\nname=a\n');
});

test('prompt-plan filters: a clean filter that keeps every byte still records, reverts, and applies', NEEDS_SED, (t) => {
  const { repo, read, patch } = setUp(t, 'cat');
  repo.write('app.conf', 'password=hunter2\nname=a\n');
  ok(patch('record', '01', 'before'));
  repo.write('app.conf', 'password=hunter2\nname=b\n');
  ok(patch('record', '01', 'after'));
  ok(patch('revert', '01'));
  assert.equal(read('app.conf'), 'password=hunter2\nname=a\n');
  ok(patch('apply', '01'));
  assert.equal(read('app.conf'), 'password=hunter2\nname=b\n');
});

// check-attr prints set for a bare filter and for filter=set alike, and git runs a driver named set for the second only;
// the names of the other values of the attribute are as good a driver name, and one with an equals sign or a line
// separator reaches git through the environment, which -c would split at the equals sign.
const NAMED = [['set', 'set'], ['unset', 'unset'], ['unspecified', 'unspecified'], ['an equals sign', 'a=b'], ['a line separator', 'a\u2028b']];
for (const [label, driver] of NAMED) {
  test(`prompt-plan filters: restore refuses a file whose lossy filter driver is named ${label === driver ? driver : `with ${label}`}`, NEEDS_SED, (t) => {
    const { repo, read, patch } = setUp(t, REDACT, driver);
    repo.write('app.conf', 'password=hunter2\nname=a\n');
    ok(patch('record', '01', 'before'));
    repo.write('app.conf', 'password=hunter2\nname=b\n');
    refused(patch('record', '01', 'restore'), HIDES);
    assert.equal(read('app.conf'), 'password=hunter2\nname=b\n');
  });
}

test('prompt-plan filters: a bare filter attribute runs no driver, even where one is named set', NEEDS_SED, (t) => {
  const { repo, read, patch } = setUp(t, REDACT, 'set', 'filter');
  repo.write('app.conf', 'password=hunter2\nname=a\n');
  ok(patch('record', '01', 'before'));
  repo.write('app.conf', 'password=hunter2\nname=b\n');
  ok(patch('record', '01', 'after'));
  ok(patch('revert', '01'));
  assert.equal(read('app.conf'), 'password=hunter2\nname=a\n');
  ok(patch('apply', '01'));
  assert.equal(read('app.conf'), 'password=hunter2\nname=b\n');
});

test('prompt-plan filters: drivers whose names hold a carriage return or a line separator do not break the comparison', NEEDS_SED, (t) => {
  const { repo, read, patch } = setUp(t);
  ok(repo.git('config', 'filter.a\rb.clean', 'cat'));
  ok(repo.git('config', 'filter.a\u2028b.process', 'cat'));
  repo.write('app.conf', 'password=hunter2\nname=a\n');
  ok(patch('record', '01', 'before'));
  repo.write('app.conf', 'password=hunter2\nname=b\n');
  refused(patch('record', '01', 'restore'), HIDES);
  assert.equal(read('app.conf'), 'password=hunter2\nname=b\n');
});
