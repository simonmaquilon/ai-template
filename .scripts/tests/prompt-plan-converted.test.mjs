// What prompt-plan's patch scripts do with files that git converts on their way into a snapshot without losing a byte:
// mixed line endings under core.autocrlf, a CRLF file under eol=lf, and one with a stale $Id$ keyword. The conversion
// changes only what a checkout writes again, so these record, revert, and apply as they are, also where a filter driver
// is configured that changes nothing: one that keeps every byte, and one named set, unset, or unspecified that the
// attribute, bare, negated, or missing, never runs.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WINDOWS, patchPlan, startRepo } from './support.mjs';

const ok = (result) => assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

test('prompt-plan converted: a CRLF file under core.autocrlf records, reverts, and applies as git checks it out', (t) => {
  const repo = startRepo(t);
  ok(repo.git('config', 'core.autocrlf', 'true'));
  const { patch } = patchPlan(repo, ['01']);
  const read = () => readFileSync(join(repo.dir, 'kept.txt'), 'utf8');
  repo.write('kept.txt', 'one\r\ntwo\r\n');
  ok(patch('record', '01', 'before'));
  repo.write('kept.txt', 'one\r\nthree\r\n');
  ok(patch('record', '01', 'after'));
  ok(patch('revert', '01'));
  assert.equal(read(), 'one\r\ntwo\r\n');
  ok(patch('apply', '01'));
  assert.equal(read(), 'one\r\nthree\r\n');
});


// Git converts these files on their way in without a filter driver, so the bytes they hold are never lost; a filter
// attribute that is bare, negated, missing, or names a driver the configuration does not define, runs none, whatever
// the attribute says. check-attr prints set, unset, and unspecified for those three, which a driver of that name in the
// configuration changes in no way, and a driver the attribute does name that keeps every byte changes nothing either.
const STALE = '$Id: 0123456789012345678901234567890123456789 $\n';
const AUTOCRLF = [['core.autocrlf', 'true']];
const MIXED = ['one\r\ntwo\n', 'one\r\nthree\n'];
const cat = (name) => [...AUTOCRLF, [`filter.${name}.clean`, 'cat']];
const CONVERTED = [
  ['a mixed-ending file under core.autocrlf', {}, ...MIXED, AUTOCRLF],
  ['a mixed-ending file with a bare filter attribute', { '.gitattributes': 'kept.txt filter\n' }, ...MIXED, AUTOCRLF],
  ['a mixed-ending file with a filter driver nothing configures', { '.gitattributes': 'kept.txt filter=prompt-plan-undefined\n' }, ...MIXED, AUTOCRLF],
  ['a mixed-ending file with a bare filter attribute and a driver named set', { '.gitattributes': 'kept.txt filter\n' }, ...MIXED, cat('set')],
  ['a mixed-ending file with no attribute and a driver named unspecified', {}, ...MIXED, cat('unspecified')],
  ['a mixed-ending file with a negated filter attribute and a driver named unset', { '.gitattributes': 'kept.txt -filter\n' }, ...MIXED, cat('unset')],
  ['a mixed-ending file with a driver that keeps every byte', { '.gitattributes': 'kept.txt filter=cat\n' }, ...MIXED, cat('cat')],
  ['a CRLF file under text=auto eol=lf', { '.gitattributes': '* text=auto eol=lf\n' }, 'one\r\ntwo\r\n', 'one\r\nthree\r\n', []],
  ['an ident file with a stale $Id$', { '.gitattributes': 'kept.txt ident\n' }, `${STALE}two\n`, `${STALE}three\n`, []],
];

for (const [label, files, first, second, configs] of CONVERTED) {
  const skip = WINDOWS && configs.some(([key]) => key.startsWith('filter.')) && 'the clean filter needs cat';
  test(`prompt-plan converted: ${label} records, reverts, and applies`, { skip }, (t) => {
    const repo = startRepo(t, { 'kept.txt': 'before\n', ...files });
    for (const config of configs) ok(repo.git('config', ...config));
    const { patch } = patchPlan(repo, ['01']);
    repo.write('kept.txt', first);
    ok(patch('record', '01', 'before'));
    repo.write('kept.txt', second);
    ok(patch('record', '01', 'after'));
    ok(patch('revert', '01'));
    ok(patch('apply', '01'));
  });
}

// A sandboxed shell fills GIT_CONFIG_PARAMETERS with git -c settings that concern no driver, in the form 'key=value' or
// the newer 'key'='value'. That is no reason to refuse a driver that keeps every byte, whatever its name holds: the
// settings that switch the driver off join those, in git's quoting. That a lossy driver they define is still refused, with
// the same names and a quote and a bang as well, is in prompt-plan-process.test.mjs.
const UNRELATED = "'http.proxyAuthMethod=basic' 'credential.http://localhost:57714.helper='";
const IN_ENVIRONMENT = [
  ['git -c settings of no driver', 'cat', UNRELATED],
  ["git -c settings in git's newer form", 'cat', "'http.proxyAuthMethod'='basic'"],
  ['a driver named with an equals sign', 'a=b', UNRELATED],
  ['a driver named with a line separator', 'a\u2028b', UNRELATED],
];
for (const [label, driver, parameters] of IN_ENVIRONMENT) {
  test(`prompt-plan converted: a mixed-ending file with a driver that keeps every byte records, reverts, and applies where GIT_CONFIG_PARAMETERS holds ${label}`, { skip: WINDOWS && 'the clean filter needs cat' }, (t) => {
    const repo = startRepo(t, { 'kept.txt': 'before\n', '.gitattributes': `kept.txt filter=${driver}\n` });
    for (const config of cat(driver)) ok(repo.git('config', ...config));
    const { patch } = patchPlan(repo, ['01'], { GIT_CONFIG_PARAMETERS: parameters });
    const read = () => readFileSync(join(repo.dir, 'kept.txt'), 'utf8');
    repo.write('kept.txt', MIXED[0]);
    ok(patch('record', '01', 'before'));
    repo.write('kept.txt', MIXED[1]);
    ok(patch('record', '01', 'after'));
    ok(patch('revert', '01'));
    // git apply writes the file as a checkout does, with the line endings the configuration asks for.
    assert.equal(read(), 'one\r\ntwo\r\n');
    ok(patch('apply', '01'));
    assert.equal(read(), 'one\r\nthree\r\n');
  });
}
