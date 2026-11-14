// The registry reads of tool-versions.mjs: package metadata through the npm CLI of this Node, located by npm-cli.mjs and
// run without a shell, and the provenance attestation through the URL that metadata names. Both go to the public npm
// registry whatever the project's npm configuration says, and the npm cache stays in .temp at the repository root.

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { npmScripts } from './npm-cli.mjs';

export const REGISTRY = 'https://registry.npmjs.org';
const PROXY = /^https?_proxy$/i;

function view(root, spec, fields) {
  const scripts = npmScripts();
  if (!scripts) throw new Error('npm CLI scripts not found for this Node');
  const cwd = join(root, '.temp');
  mkdirSync(cwd, { recursive: true });
  const args = [join(scripts, 'npm-cli.js'), 'view', spec, ...fields, '--json', '--registry', `${REGISTRY}/`, '--cache', join(cwd, 'npm-cache')];
  const run = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  let found;
  try {
    found = JSON.parse(run.stdout);
  } catch {
    found = undefined;
  }
  if (run.status !== 0 || found === undefined || found.error) {
    const reason = found?.error?.summary ?? found?.error?.code ?? (run.stderr.trim().split('\n')[0] || 'no answer');
    throw new Error(`npm view ${spec} failed (${reason})`);
  }
  return Array.isArray(found) ? found[0] : found;
}

// { latest, versions, time } of a package.
export function meta(root, name) {
  const found = view(root, name, ['time', 'dist-tags', 'versions']);
  return { latest: found['dist-tags']?.latest, versions: found.versions ?? [], time: found.time ?? {} };
}

// What the registry says about one version: its integrity hash, license, repository, direct dependencies, and attestation URL, if any.
export function versionInfo(root, name, version) {
  const found = view(root, `${name}@${version}`, ['dist.integrity', 'dist.attestations', 'license', 'repository.url', 'dependencies']);
  return { integrity: found['dist.integrity'], attestationsUrl: found['dist.attestations']?.url, repository: found['repository.url'], dependencies: found.dependencies ?? {},
    license: typeof found.license === 'string' ? found.license : found.license?.type };
}

// The attestations document of a version. Node's fetch reaches the network through a proxy only with NODE_USE_ENV_PROXY
// set, which tool-versions.mjs does before this runs.
export async function attestations(url) {
  if (!url.startsWith(`${REGISTRY}/-/npm/v1/attestations/`)) throw new Error(`the attestations URL ${url} is not the registry's`);
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`the registry answered ${response.status}`);
    return await response.json();
  } catch (error) {
    const proxied = Object.keys(process.env).some((key) => PROXY.test(key));
    throw new Error(`cannot read ${url} (${error.cause?.code ?? error.message})${proxied && !process.env.NODE_USE_ENV_PROXY
      ? '; this Node does not use the proxy variables of the environment' : ''}`);
  }
}
