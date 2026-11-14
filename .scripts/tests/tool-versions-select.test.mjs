import assert from 'node:assert/strict';
import test from 'node:test';
import { MIN_AGE_DAYS, compareVersions, selectVersion } from '../tool-versions-select.mjs';

const NOW = Date.parse('2026-11-14T12:00:00.000Z');
const ago = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
// Registry data from a map of version to its age in days; `versions` may leave out a version that `time` still names.
const registry = (latest, ages, versions = Object.keys(ages)) => ({ latest, versions, time: Object.fromEntries(Object.entries(ages).map(([v, d]) => [v, ago(d)])) });
const pick = (data, hold) => selectVersion(data, { hold, now: NOW });

test('the minimum age is seven days, and a version published exactly that long ago is old enough', () => {
  assert.equal(MIN_AGE_DAYS, 7);
  assert.equal(pick(registry('1.1.0', { '1.0.0': 30, '1.1.0': 7 })).version, '1.1.0');
  assert.equal(pick(registry('1.1.0', { '1.0.0': 30, '1.1.0': 6.9 })).version, '1.0.0');
});

test('a prerelease is never chosen, even when it is what latest names', () => {
  const data = registry('1.2.1-rc.1', { '1.2.0': 30, '1.2.1-rc.1': 20, '1.1.0': 90 });
  const result = pick(data);
  assert.equal(result.version, '1.2.0');
  assert.match(result.behind, /latest 1\.2\.1-rc\.1 is a prerelease/);
  assert.equal(pick(registry('1.3.0', { '1.3.0': 30, '1.3.0-rc.1': 40, '1.4.0-beta.1': 50 })).version, '1.3.0');
});

test('a latest under seven days old gives way to the newest stable version before it that is old enough', () => {
  const result = pick(registry('1.4.0', { '1.4.0': 2, '1.3.0': 3, '1.2.0': 10, '1.1.0': 40 }));
  assert.equal(result.version, '1.2.0');
  assert.equal(result.published, ago(10));
  assert.match(result.behind, /latest 1\.4\.0 is under 7 days old/);
  assert.equal(pick(registry('1.4.0', { '1.4.0': 8, '1.3.0': 20 })).behind, null);
});

test('when no version is old enough nothing is chosen and the reason says so', () => {
  const result = pick(registry('1.4.0', { '1.4.0': 1, '1.3.0': 3, '1.2.0': 6 }));
  assert.equal(result.version, undefined);
  assert.match(result.reason, /1\.4\.0 is the newest candidate and was published .* under 7 days ago/);
  assert.match(pick({ latest: undefined, versions: [], time: {} }).reason, /no valid dist-tag latest/);
});

test('a hold keeps the choice inside its line, whatever latest names', () => {
  const data = registry('9.0.2', { '9.0.2': 50, '8.0.3': 100, '8.0.2': 120, '7.9.3': 400 });
  const result = pick(data, '8');
  assert.equal(result.version, '8.0.3');
  assert.match(result.behind, /latest 9\.0\.2 is outside the held line 8/);
  const minor = registry('3.65.1', { '3.65.1': 1, '3.65.0': 9, '3.64.1': 30, '3.64.0': 38, '3.640.0': 50 });
  assert.equal(pick(minor, '3.64').version, '3.64.1');
  assert.equal(pick(minor, '3.64.0').version, '3.64.0');
  assert.match(pick(registry('9.0.2', { '9.0.2': 50 }), '8').reason, /no stable version up to latest 9\.0\.2 in the held line 8/);
  assert.equal(pick(registry('8.1.0', { '8.1.0': 1, '8.0.9': 20, '9.0.0': 20 }), '8').version, '8.0.9');
});

test('a latest that goes back never lets a newer version be chosen', () => {
  const result = pick(registry('1.2.0', { '1.3.0': 40, '1.2.0': 50, '1.1.0': 60 }));
  assert.equal(result.version, '1.2.0');
  assert.equal(pick(registry('1.2.0', { '1.3.0': 40, '1.2.0': 1, '1.1.0': 60 })).version, '1.1.0');
});

test('versions the registry no longer lists are ignored, and the order is by semver, not by text', () => {
  assert.equal(pick(registry('1.5.0', { '1.5.0': 30, '1.4.0': 40 }, ['1.4.0'])).version, '1.4.0');
  assert.equal(pick(registry('1.10.0', { '1.10.0': 30, '1.9.0': 40, '1.2.0': 50 })).version, '1.10.0');
  assert.equal(pick(registry('1.10.0', { '1.10.0': 1, '1.9.0': 40, '1.2.0': 50 })).version, '1.9.0');
  const ordered = ['1.0.0', '1.0.0-rc.1', '1.0.0-beta.11', '1.0.0-beta.2', '1.0.0-beta', '1.0.0-alpha.1', '1.0.0-alpha', '0.9.10', '0.9.9', '10.0.0', '2.0.0'];
  assert.deepEqual([...ordered].sort(compareVersions), ['0.9.9', '0.9.10', '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-beta', '1.0.0-beta.2',
    '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '2.0.0', '10.0.0']);
});
