import assert from 'node:assert/strict';
import test from 'node:test';
import { entryProblems } from '../tool-versions-file.mjs';
import { refresh } from '../tool-versions-refresh.mjs';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const SLSA = 'https://slsa.dev/provenance/v1';
const BYTES = Buffer.alloc(64, 7);
const INTEGRITY = `sha512-${BYTES.toString('base64')}`;
const ago = (days) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
const BASE = { repository: 'https://github.com/Owner/Repo' };
const old = { version: '1.0.0', integrity: INTEGRITY, published: ago(60), resolved: ago(50), repository: BASE.repository, license: 'MIT' };

// An attestations document whose SLSA provenance is about `subject` and names `repository`.
function provenance(repository = 'https://github.com/owner/repo', subject = {}) {
  const statement = { _type: 'https://in-toto.io/Statement/v1', predicateType: SLSA,
    subject: [{ name: 'pkg:npm/tool@1.2.0', digest: { sha512: BYTES.toString('hex') }, ...subject }],
    predicate: { buildDefinition: { externalParameters: { workflow: { repository } } } } };
  return { attestations: [{ predicateType: 'other' }, { predicateType: SLSA, bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString('base64') } } }] };
}
// A registry with the given versions by age; each part can be replaced to model what the registry says.
const fake = ({ latest = '1.2.0', ages = { '1.2.0': 20, '1.0.0': 60 }, info = {}, document = provenance() } = {}) => ({
  meta: async () => ({ latest, versions: Object.keys(ages), time: Object.fromEntries(Object.entries(ages).map(([v, d]) => [v, ago(d)])) }),
  versionInfo: async () => ({ integrity: INTEGRITY, attestationsUrl: 'https://registry.npmjs.org/-/npm/v1/attestations/tool@1.2.0',
    repository: 'git+https://github.com/owner/repo.git', license: 'MIT', ...info }),
  attestations: async () => document,
});
const run = (registry, base = old, name = 'tool') => refresh(base.version === undefined ? {} : { [name]: base }, new Map([[name, base]]), registry, NOW);

test('a version whose provenance names the recorded repository is recorded with its hash and dates', async () => {
  const result = await run(fake());
  assert.equal(result.failed, false);
  assert.match(result.lines[0], /^tool: 1\.0\.0 -> 1\.2\.0 \(published 2026-10-25\)$/);
  assert.deepEqual(result.data.tool, { ...old, version: '1.2.0', published: ago(20), resolved: NOW.toISOString() });
  assert.deepEqual(entryProblems('tool', result.data.tool), []);
});

test('a provenance that names another repository leaves the package as it was and fails the refresh', async () => {
  const result = await run(fake({ document: provenance('https://github.com/attacker/repo') }));
  assert.equal(result.failed, true);
  assert.equal(result.changed, false);
  assert.match(result.lines[0], /^tool: not updated, its provenance names https:\/\/github\.com\/attacker\/repo, not https:\/\/github\.com\/Owner\/Repo$/);
  assert.deepEqual(result.data.tool, old);
});

test('a package without an attestation fails unless its entry records an exception, which still needs the repository to match', async () => {
  const none = await run(fake({ info: { attestationsUrl: undefined } }));
  assert.equal(none.failed, true);
  assert.match(none.lines[0], /publishes no provenance attestation \(a provenanceException/);
  const excepted = { ...old, provenanceException: 'its publisher attests nothing' };
  const allowed = await run(fake({ info: { attestationsUrl: undefined } }), excepted);
  assert.equal(allowed.failed, false);
  assert.equal(allowed.data.tool.version, '1.2.0');
  assert.equal(allowed.data.tool.provenanceException, 'its publisher attests nothing');
  const other = await run(fake({ info: { attestationsUrl: undefined, repository: 'git+https://github.com/other/repo.git' } }), excepted);
  assert.equal(other.failed, true);
  assert.match(other.lines[0], /its metadata names git\+https:\/\/github\.com\/other\/repo\.git/);
});

test('an attestation of another version, another tarball or without SLSA provenance fails', async () => {
  const wrong = [provenance(undefined, { name: 'pkg:npm/tool@1.1.0' }), provenance(undefined, { digest: { sha512: '00' } }),
    { attestations: [{ predicateType: 'other' }] }, { attestations: [{ predicateType: SLSA, bundle: { dsseEnvelope: { payload: '%' } } }] }, {}];
  for (const document of wrong) {
    const result = await run(fake({ document }));
    assert.equal(result.failed, true, JSON.stringify(document).slice(0, 80));
    assert.deepEqual(result.data.tool, old);
  }
  const scoped = await run(fake({ document: provenance(undefined, { name: 'pkg:npm/%40o/tool@1.2.0' }) }), old, '@o/tool');
  assert.equal(scoped.failed, false, scoped.lines[0]);
});

test('a recorded version whose hash the registry now reports differently is a failure, and an unchanged one keeps its dates', async () => {
  const differs = await run(fake({ ages: { '1.0.0': 60 }, latest: '1.0.0', info: { integrity: `sha512-${Buffer.alloc(64, 1).toString('base64')}` } }));
  assert.equal(differs.failed, true);
  assert.match(differs.lines[0], /another integrity hash than the recorded one/);
  const same = await run(fake({ ages: { '1.0.0': 60 }, latest: '1.0.0', document: provenance(undefined, { name: 'pkg:npm/tool@1.0.0' }) }));
  assert.equal(same.failed, false, same.lines[0]);
  assert.equal(same.changed, false);
  assert.equal(same.lines[0], 'tool: unchanged at 1.0.0');
  assert.deepEqual(same.data.tool, old);
});

test('when nothing is old enough the package keeps its entry and the line says why, without failing', async () => {
  const result = await run(fake({ latest: '1.3.0', ages: { '1.3.0': 1, '1.2.0': 3 } }));
  assert.equal(result.failed, false);
  assert.equal(result.changed, false);
  assert.match(result.lines[0], /^tool: not moved, 1\.3\.0 is the newest candidate/);
  assert.deepEqual(result.data.tool, old);
});

test('a hold survives a refresh, a move to an older version says so, and a new package needs a version to record', async () => {
  const held = { ...old, version: '9.0.0', hold: '8', holdReason: 'wraps tsserver' };
  const result = await run(fake({ latest: '9.1.0', ages: { '9.1.0': 40, '9.0.0': 80, '8.0.3': 100 }, document: provenance(undefined, { name: 'pkg:npm/tool@8.0.3' }) }), held);
  assert.equal(result.data.tool.version, '8.0.3');
  assert.equal(result.data.tool.hold, '8');
  assert.match(result.lines[0], /9\.0\.0 -> 8\.0\.3 \(downgrade\).*latest 9\.1\.0 is outside the held line 8/);
  const added = await run(fake({ latest: '1.3.0', ages: { '1.3.0': 1 } }), BASE);
  assert.equal(added.failed, true);
  assert.equal(added.data.tool, undefined);
  assert.match(added.lines[0], /nothing can be recorded/);
});

test('one failing package does not stop the others, and the file lists its packages in name order', async () => {
  const registry = { ...fake(), versionInfo: async (name) => { if (name === 'bad') throw new Error('npm view bad failed (E404)'); return fake().versionInfo(); } };
  const result = await refresh({ tool: old, bad: old }, new Map([['tool', old], ['bad', old]]), registry, NOW);
  assert.equal(result.failed, true);
  assert.deepEqual(Object.keys(result.data), ['bad', 'tool']);
  assert.equal(result.data.tool.version, '1.2.0');
  assert.deepEqual(result.data.bad, old);
  assert.match(result.lines.join('\n'), /^tool: 1\.0\.0 -> 1\.2\.0.*\nbad: not updated, npm view bad failed \(E404\)$/s);
});
