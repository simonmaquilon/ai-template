// The refresh of tool-versions.mjs, without any I/O of its own: it takes the registry as an object with meta(name),
// versionInfo(name, version) and attestations(url), so tests inject registry data. A package is updated only when its
// chosen version has a provenance attestation whose source repository is the recorded one, or its entry carries a
// provenanceException that says why it has none; otherwise it keeps its entry and the refresh reports a failure.

import { VERSION, entryProblems } from './tool-versions-file.mjs';
import { compareVersions, selectVersion } from './tool-versions-select.mjs';

const SLSA = 'https://slsa.dev/provenance/v1';
const ENTRY_ORDER = ['version', 'integrity', 'published', 'resolved', 'repository', 'license', 'hold', 'holdReason', 'provenanceException', 'dependencies'];
const normalize = (url) => String(url ?? '').trim().replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '').replace(/\/+$/, '').toLowerCase();

// The source repository that the SLSA provenance of the attestations document names, provided it is about this package
// version and this tarball; throws a sentence otherwise.
export function attestedRepository(document, name, version, integrity) {
  const attestation = document?.attestations?.find((item) => item?.predicateType === SLSA);
  if (!attestation) throw new Error('its attestations hold no SLSA provenance');
  let statement;
  try {
    statement = JSON.parse(Buffer.from(attestation.bundle.dsseEnvelope.payload, 'base64').toString('utf8'));
  } catch {
    throw new Error('its provenance attestation is unreadable');
  }
  const subject = statement.subject?.[0];
  const digest = Buffer.from(integrity.slice('sha512-'.length), 'base64').toString('hex');
  if (statement.predicateType !== SLSA || subject?.name !== `pkg:npm/${name.replace('@', '%40')}@${version}` || subject.digest?.sha512 !== digest) {
    throw new Error('its provenance attestation is for another package, version or tarball');
  }
  const repository = statement.predicate?.buildDefinition?.externalParameters?.workflow?.repository;
  if (typeof repository !== 'string') throw new Error('its provenance names no source repository');
  return repository;
}

async function verify(name, version, info, base, registry) {
  if (base.provenanceException !== undefined) {
    if (normalize(info.repository) !== normalize(base.repository)) throw new Error(`its metadata names ${info.repository}, not ${base.repository}`);
    return;
  }
  if (!info.attestationsUrl) throw new Error('it publishes no provenance attestation (a provenanceException with its reason accepts that)');
  const found = attestedRepository(await registry.attestations(info.attestationsUrl), name, version, info.integrity);
  if (normalize(found) !== normalize(base.repository)) throw new Error(`its provenance names ${found}, not ${base.repository}`);
}

// The direct dependencies a version pins to an exact version, with the integrity hash the registry reports for each; a range
// leaves a version undetermined, so it is not recorded. They need no attestation of their own: the attested package fixes
// them, and the hash fixes what is installed.
async function exactDependencies(declared, recorded, registry) {
  const found = {};
  for (const [dependency, spec] of Object.entries(declared ?? {})) {
    if (!VERSION.test(spec)) continue;
    const { integrity } = await registry.versionInfo(dependency, spec);
    if (!integrity) throw new Error(`the registry reports no integrity hash for ${dependency}@${spec}`);
    if (recorded?.[dependency]?.version === spec && recorded[dependency].integrity !== integrity) throw new Error(`the registry reports another integrity hash for ${dependency}@${spec} than the recorded one`);
    found[dependency] = { version: spec, integrity };
  }
  return found;
}

// { entry, line, failed } for one package; `base` is its recorded entry, or the repository and options of a package being added.
export async function refreshPackage(name, base, registry, now) {
  const added = base.version === undefined;
  try {
    const pick = selectVersion(await registry.meta(name), { hold: base.hold, now: now.getTime() });
    if (pick.reason) {
      if (added) throw new Error(`nothing can be recorded: ${pick.reason}`);
      return { entry: base, line: `${name}: not moved, ${pick.reason}` };
    }
    const info = await registry.versionInfo(name, pick.version);
    if (base.version === pick.version && base.integrity !== info.integrity) throw new Error('the registry reports another integrity hash than the recorded one');
    await verify(name, pick.version, info, base, registry);
    const dependencies = await exactDependencies(info.dependencies, base.dependencies, registry);
    const candidate = { ...base, version: pick.version, integrity: info.integrity, published: pick.published, resolved: now.toISOString(),
      license: info.license, dependencies: Object.keys(dependencies).length > 0 ? dependencies : undefined };
    const entry = Object.fromEntries(ENTRY_ORDER.filter((key) => candidate[key] !== undefined).map((key) => [key, candidate[key]]));
    const problems = entryProblems(name, entry);
    if (problems.length > 0) throw new Error(`the result is invalid (${problems[0]})`);
    const note = (pick.behind ? `; ${pick.behind}` : '') + Object.entries(dependencies).map(([dep, { version }]) => `; pins ${dep} ${version}`).join('');
    if (!added && base.version === pick.version) {
      if (JSON.stringify(base.dependencies ?? {}) === JSON.stringify(dependencies)) return { entry: base, line: `${name}: unchanged at ${pick.version}${note}` };
      return { entry, line: `${name}: unchanged at ${pick.version}, dependencies recorded${note}`, changed: true };
    }
    const move = added ? 'added' : `${base.version} -> ${pick.version}${compareVersions(pick.version, base.version) < 0 ? ' (downgrade)' : ''}`;
    return { entry, line: `${name}: ${move}${added ? ` ${pick.version}` : ''} (published ${pick.published.slice(0, 10)})${note}`, changed: true };
  } catch (error) {
    return { entry: added ? undefined : base, line: `${name}: not updated, ${error.message}`, failed: true };
  }
}

// Refreshes the packages of `bases`, a Map of name to base; returns the data to write and a line per package.
export async function refresh(data, bases, registry, now = new Date()) {
  const next = { ...data };
  const result = { lines: [], failed: false, changed: false };
  for (const [name, base] of bases) {
    const { entry, line, failed, changed } = await refreshPackage(name, base, registry, now);
    if (entry !== undefined) next[name] = entry;
    result.lines.push(line);
    result.failed ||= Boolean(failed);
    result.changed ||= Boolean(changed);
  }
  result.data = Object.fromEntries(Object.entries(next).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return result;
}
