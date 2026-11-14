import assert from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { INTEGRITY, entry, fixture } from './tool-versions-fixture.mjs';
import { WINDOWS } from './support.mjs';

const unprotected = WINDOWS || process.getuid?.() === 0;
const rejected = (cli, reason) => {
  const result = cli(['--check']);
  assert.equal(result.status, 1, result.stdout);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, reason);
};

test('--check passes a valid file without touching the network, and says nothing', (t) => {
  const cli = fixture(t, { tool: entry(), other: entry({ hold: '1', holdReason: 'stays on the major', provenanceException: 'publishes none',
    dependencies: { dep: { version: '1.0.0', integrity: INTEGRITY } } }) });
  const result = cli(['--check']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout + result.stderr, '');
  assert.equal(existsSync(join(cli.dir, 'npm.log')), false, 'npm never ran');
});

test('--check rejects a version that is not exact, a missing integrity and an unknown field, naming the package', (t) => {
  for (const [change, reason] of [[{ version: '^1.0.0' }, /tool: version is not an exact X\.Y\.Z version/], [{ version: '1.0' }, /exact X\.Y\.Z/],
    [{ version: '1.0.0-beta.1' }, /exact X\.Y\.Z/], [{ integrity: undefined }, /tool: integrity is missing/], [{ integrity: 'sha1-abc' }, /integrity is not a sha512/],
    [{ extra: true }, /tool: unknown field "extra"/], [{ published: '2026-01-01' }, /published is not a UTC date/],
    [{ published: '2026-03-01T00:00:00.000Z' }, /published is later than resolved/], [{ repository: 'https://example.com/o/r' }, /repository is not https:\/\/github\.com/],
    [{ repository: 'https://github.com/o/r.git' }, /repository is not/], [{ license: '' }, /license is empty/], [{ hold: '1' }, /hold and holdReason go together/],
    [{ hold: '2', holdReason: 'why' }, /version is outside its hold/], [{ hold: 'v1', holdReason: 'why' }, /hold is not a major/],
    [{ provenanceException: ' ' }, /provenanceException is empty/], [{ dependencies: [] }, /tool: dependencies is not an object/],
    [{ dependencies: { dep: { version: '1.0.0' } } }, /dependencies\.dep has no sha512 integrity hash/],
    [{ dependencies: { dep: { version: '^1.0.0', integrity: INTEGRITY } } }, /dependencies\.dep has no exact X\.Y\.Z version/],
    [{ dependencies: { dep: { version: '1.0.0', integrity: INTEGRITY, extra: 1 } } }, /dependencies\.dep has an unknown field/],
    [{ dependencies: { tool: { version: '1.0.0', integrity: INTEGRITY } } }, /dependencies\.tool is the package itself/],
    [{ dependencies: { 'Bad Name': { version: '1.0.0', integrity: INTEGRITY } } }, /dependencies\.Bad Name is not a package name/]]) {
    rejected(fixture(t, { tool: entry(change) }), reason);
  }
  rejected(fixture(t, { 'Bad Name': entry() }), /"Bad Name" is not a package name/);
  rejected(fixture(t, { tool: [] }), /tool: the entry is not an object/);
  rejected(fixture(t, '{ not json'), /is not valid JSON/);
  rejected(fixture(t, undefined), /is missing/);
});

test('misuse exits 2 with the usage, and nothing is recorded', (t) => {
  const cli = fixture(t, { tool: entry() });
  for (const args of [[], ['--nope'], ['--check', 'extra'], ['--add'], ['--add', 'x'], ['--add', 'x', '--repository'], ['--add', 'x', '--repository', 'https://x.test/o/r'],
    ['--add', 'x', '--repository', 'https://github.com/o/r', '--hold', '6'], ['--add', 'x', '--repository', 'https://github.com/o/r', '--other', 'v'],
    ['--add', 'Bad Name', '--repository', 'https://github.com/o/r']]) {
    assert.equal(cli(args).status, 2, args.join(' '));
  }
  assert.equal(cli(['--refresh', 'unknown']).status, 1);
  assert.match(cli(['--refresh', 'unknown']).stderr, /unknown is not recorded.*--add unknown --repository/);
  assert.match(cli(['--add', 'tool', '--repository', 'https://github.com/o/r']).stderr, /tool is already recorded/);
  assert.equal(existsSync(join(cli.dir, 'npm.log')), false, 'npm never ran');
});

test('--refresh asks npm for the public registry with a cache in .temp, and records what the rule picks', (t) => {
  const cli = fixture(t, { tool: entry({ provenanceException: 'publishes none' }) });
  const result = cli(['--refresh']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^tool: 1\.0\.0 -> 1\.2\.0 \(published 2026-01-10\)/);
  assert.deepEqual([cli.file().tool.version, cli.file().tool.integrity], ['1.2.0', INTEGRITY]);
  const [first, second] = cli.calls();
  assert.deepEqual(first.args.slice(0, 5), ['view', 'tool', 'time', 'dist-tags', 'versions']);
  assert.deepEqual(second.args.slice(0, 2), ['view', 'tool@1.2.0']);
  for (const call of [first, second]) {
    assert.ok(call.args.includes('--json'));
    assert.equal(call.args[call.args.indexOf('--registry') + 1], 'https://registry.npmjs.org/');
    assert.equal(call.args[call.args.indexOf('--cache') + 1], join(cli.dir, '.temp', 'npm-cache'));
    assert.equal(call.cwd, join(cli.dir, '.temp'));
  }
  assert.equal(cli(['--refresh', 'tool']).stdout.trim(), 'tool: unchanged at 1.2.0');
});

test('--add records a new package with its hold, and a refresh behind a proxy variable turns the proxy on for fetch', (t) => {
  const cli = fixture(t, { tool: entry() });
  const result = cli(['--add', 'extra', '--repository', 'https://github.com/o/r', '--provenance-exception', 'publishes none', '--hold', '1', '--hold-reason', 'major 1'],
    { HTTPS_PROXY: 'http://127.0.0.1:9' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^extra: added 1\.2\.0/);
  assert.equal(cli.calls()[0].proxy, '1', 'the script started itself again with NODE_USE_ENV_PROXY');
  assert.deepEqual(Object.keys(cli.file()), ['extra', 'tool']);
  assert.deepEqual([cli.file().extra.hold, cli.file().extra.holdReason, cli.file().extra.provenanceException], ['1', 'major 1', 'publishes none']);
});

test('--refresh cannot write a file the sandbox protects, says so, and still exits 1', { skip: unprotected }, (t) => {
  const cli = fixture(t, { tool: entry({ provenanceException: 'publishes none' }) });
  chmodSync(join(cli.dir, '.agents', 'tool-versions.json'), 0o444);
  const result = cli(['--refresh']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot write \.agents\/tool-versions\.json \(EACCES\); it is protected from commands confined by the client sandbox, so run this command outside the sandbox.*nothing was recorded/);
  assert.equal(JSON.parse(readFileSync(join(cli.dir, '.agents', 'tool-versions.json'), 'utf8')).tool.version, '1.0.0');
});
