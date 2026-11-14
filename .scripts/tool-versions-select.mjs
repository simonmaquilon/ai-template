// Chooses the version of a package that .agents/tool-versions.json may record, from registry data alone: the stable
// version the dist-tag `latest` names, or, when that is still too new or outside the line the package is held in, the
// newest stable version below it that is. Versions are compared by semver, never as text.

import { VERSION, inLine } from './tool-versions-file.mjs';

// A version must have been published this many days before it is recorded.
export const MIN_AGE_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

// Negative, zero or positive as semver orders a before, with or after b; a prerelease precedes its release.
export function compareVersions(a, b) {
  const [x, y] = [a, b].map((version) => SEMVER.exec(version));
  for (let i = 1; i <= 3; i += 1) if (x[i] !== y[i]) return Number(x[i]) - Number(y[i]);
  if (x[4] === y[4]) return 0;
  if (x[4] === undefined || y[4] === undefined) return x[4] === undefined ? 1 : -1;
  const [p, q] = [x[4].split('.'), y[4].split('.')];
  for (let i = 0; i < Math.min(p.length, q.length); i += 1) {
    if (p[i] === q[i]) continue;
    const numbers = /^\d+$/.test(p[i]) && /^\d+$/.test(q[i]);
    if (numbers) return Number(p[i]) - Number(q[i]);
    if (/^\d+$/.test(p[i]) !== /^\d+$/.test(q[i])) return /^\d+$/.test(p[i]) ? -1 : 1;
    return p[i] < q[i] ? -1 : 1;
  }
  return p.length - q.length;
}

// { version, published, behind } or { reason }. `meta` is { latest, versions, time } from the registry; `behind` says why
// the result is not `latest` itself, or is null.
export function selectVersion({ latest, versions, time }, { hold, now = Date.now(), minAgeDays = MIN_AGE_DAYS } = {}) {
  if (!SEMVER.test(latest ?? '')) return { reason: 'the registry names no valid dist-tag latest' };
  const cutoff = now - minAgeDays * DAY;
  const stable = versions.filter((version) => VERSION.test(version) && compareVersions(version, latest) <= 0 && inLine(version, hold));
  if (stable.length === 0) return { reason: `no stable version up to latest ${latest}${hold === undefined ? '' : ` in the held line ${hold}`}` };
  const old = stable.filter((version) => Date.parse(time[version]) <= cutoff).sort(compareVersions);
  if (old.length === 0) {
    const newest = stable.sort(compareVersions).at(-1);
    return { reason: `${newest} is the newest candidate and was published ${time[newest]}, under ${minAgeDays} days ago` };
  }
  const version = old.at(-1);
  const behind = version === latest ? null
    : !inLine(latest, hold) ? `latest ${latest} is outside the held line ${hold}`
      : !VERSION.test(latest) ? `latest ${latest} is a prerelease`
        : `latest ${latest} is under ${minAgeDays} days old (published ${time[latest]})`;
  return { version, published: time[version], behind };
}
