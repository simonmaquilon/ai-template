import assert from 'node:assert/strict';
import test from 'node:test';
import { refresh } from '../tool-versions-refresh.mjs';
import { entry } from './tool-versions-fixture.mjs';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const hash = (byte) => `sha512-${Buffer.alloc(64, byte).toString('base64')}`;
const base = { ...entry({ integrity: hash(1) }), provenanceException: 'publishes none' };
// A registry whose package pins `declared` dependencies, and whose dependency integrities are those of `hashes`.
const fake = (declared, hashes = { exact: hash(2), 'also-exact': hash(3) }) => ({
  meta: async () => ({ latest: '1.0.0', versions: ['1.0.0'], time: { '1.0.0': '2026-01-01T00:00:00.000Z' } }),
  versionInfo: async (name, version) => (name === 'tool' ? { integrity: hash(1), repository: 'https://github.com/o/r', license: 'MIT', dependencies: declared }
    : { integrity: hashes[name], version }),
});
const run = (registry, recorded = base) => refresh({ tool: recorded }, new Map([['tool', recorded]]), registry, NOW);

test('the refresh records the dependencies a package pins exactly, with their integrity, and leaves out ranges', async () => {
  const result = await run(fake({ exact: '2.0.0', ranged: '^3.0.0', loose: '>=1', tagged: 'latest', 'also-exact': '4.1.0' }));
  assert.equal(result.failed, false, result.lines[0]);
  assert.deepEqual(result.data.tool.dependencies, { exact: { version: '2.0.0', integrity: hash(2) }, 'also-exact': { version: '4.1.0', integrity: hash(3) } });
  assert.match(result.lines[0], /^tool: unchanged at 1\.0\.0, dependencies recorded; pins exact 2\.0\.0; pins also-exact 4\.1\.0$/);
  assert.equal(result.changed, true);
});

test('a package without exact dependencies records none, and an unchanged record reports no change', async () => {
  const none = await run(fake({ ranged: '^3.0.0' }));
  assert.equal(none.data.tool.dependencies, undefined);
  assert.equal(none.changed, false);
  const recorded = { ...base, dependencies: { exact: { version: '2.0.0', integrity: hash(2) } } };
  const same = await run(fake({ exact: '2.0.0' }), recorded);
  assert.equal(same.changed, false);
  assert.deepEqual(same.data.tool, recorded);
  const dropped = await run(fake({ ranged: '^3.0.0' }), recorded);
  assert.equal(dropped.changed, true);
  assert.equal(dropped.data.tool.dependencies, undefined);
});

test('a dependency whose recorded integrity the registry now reports differently, or without integrity, fails the package', async () => {
  const recorded = { ...base, dependencies: { exact: { version: '2.0.0', integrity: hash(9) } } };
  const differs = await run(fake({ exact: '2.0.0' }), recorded);
  assert.equal(differs.failed, true);
  assert.match(differs.lines[0], /another integrity hash for exact@2\.0\.0 than the recorded one/);
  assert.deepEqual(differs.data.tool, recorded);
  const missing = await run(fake({ exact: '2.0.0' }, {}));
  assert.equal(missing.failed, true);
  assert.match(missing.lines[0], /no integrity hash for exact@2\.0\.0/);
});
