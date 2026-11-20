// What each finding of release-command.mjs publishes, for the release hook, resolved against the tags and commits of
// the folder it runs in: { kind, name, sha } where name is the tag or release, or null for the tags a push takes
// without naming them, and sha is the full id of the commit its CI must have passed, or null when git cannot give it.
// The commit is that of the tag when it exists here; otherwise what the command names as its source or target, when git
// resolves it here; otherwise HEAD.

import { git } from './hook-support.mjs';

const TAGS = 'refs/tags/';

const commitOf = (dir, name) => (name ? git(['-C', dir, 'rev-parse', '--verify', '-q', `${name}^{commit}`])?.trim() ?? null : null);
const tagCommit = (dir, name) => commitOf(dir, `${TAGS}${name}`);

// The tag a refspec publishes and its commit, or null when it publishes no tag.
function specTarget(dir, { src, dst, tag }) {
  const head = () => commitOf(dir, 'HEAD');
  if (tag !== undefined) return { name: tag, sha: tagCommit(dir, tag) ?? head() };
  if (src.startsWith(TAGS)) return { name: src.slice(TAGS.length), sha: commitOf(dir, src) ?? head() };
  if (dst?.startsWith(TAGS)) return { name: dst.slice(TAGS.length), sha: commitOf(dir, src) ?? tagCommit(dir, dst.slice(TAGS.length)) ?? head() };
  // A source git completes to a tag, as v1 or tags/v1 does, publishes that tag.
  const full = src ? git(['-C', dir, 'rev-parse', '--symbolic-full-name', src])?.trim() : null;
  return full?.startsWith(TAGS) ? { name: full.slice(TAGS.length), sha: commitOf(dir, full) } : null;
}

export function releaseTargets(findings) {
  return findings.flatMap((finding) => {
    const { dir } = finding;
    if (finding.kind === 'release') {
      const sha = tagCommit(dir, finding.tag) ?? commitOf(dir, finding.target) ?? commitOf(dir, 'HEAD');
      return [{ kind: 'release', name: finding.tag, sha }];
    }
    const targets = finding.specs.map((spec) => specTarget(dir, spec)).filter(Boolean);
    if (finding.all) targets.unshift({ name: null, sha: commitOf(dir, 'HEAD') });
    return targets.map((target) => ({ kind: 'push', ...target }));
  });
}
