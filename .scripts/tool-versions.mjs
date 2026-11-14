#!/usr/bin/env node
// Resolves, records and checks the versions of the tools the agent configuration runs, in .agents/tool-versions.json
// (06-dependencies-and-stack.md). Nothing here runs by itself: the file changes only through --refresh or --add.
//   node .scripts/tool-versions.mjs --check                    no network; validate the file, exit 1 with the reasons
//   node .scripts/tool-versions.mjs --refresh [package...]     re-resolve the named packages, or every recorded one
//   node .scripts/tool-versions.mjs --add <package> --repository https://github.com/<owner>/<repo>
//                                   [--hold <line> --hold-reason <text>] [--provenance-exception <reason>]
// A version is the dist-tag `latest` of the npm registry when it is stable and at least MIN_AGE_DAYS old, else the newest
// stable version before it that is, kept inside the major, major.minor or exact line a package is held in. Its
// provenance attestation must name the recorded repository. Nothing is installed. The file is protected from confined
// commands (sandbox.filesystem.denyWrite), so a refresh writes it only when it runs outside the client sandbox.

import { spawnSync } from 'node:child_process';
import { lstatSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOLD, PACKAGE, REPOSITORY, TOOL_VERSIONS, fileProblems, readToolVersions } from './tool-versions-file.mjs';
import { refresh } from './tool-versions-refresh.mjs';
import * as registry from './tool-versions-registry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROXY = /^https?_proxy$/i;
const USAGE = 'usage: tool-versions.mjs --check | --refresh [package...] | --add <package> --repository <url> '
  + '[--hold <line> --hold-reason <text>] [--provenance-exception <reason>]';
const stop = (message, code = 1) => {
  console.error(`tool-versions: ${message}`);
  process.exit(code);
};

const [mode, ...rest] = process.argv.slice(2);
if (!['--check', '--refresh', '--add'].includes(mode)) stop(USAGE, 2);
const loaded = readToolVersions(ROOT);
if (loaded.error) stop(loaded.error);
const data = loaded.data ?? {};

if (mode === '--check') {
  if (rest.length > 0) stop(USAGE, 2);
  if (loaded.data === null) stop(`${TOOL_VERSIONS} is missing`);
  const problems = fileProblems(data);
  if (problems.length > 0) stop(`${TOOL_VERSIONS} is invalid:\n  ${problems.join('\n  ')}`);
  process.exit(0);
}

// Node's fetch uses the proxy of the environment, which the Claude Code sandbox sets, only with NODE_USE_ENV_PROXY.
if (!process.env.NODE_USE_ENV_PROXY && Object.keys(process.env).some((key) => PROXY.test(key))) {
  const again = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(again.status ?? 1);
}

const bases = new Map();
if (mode === '--refresh') {
  for (const name of rest.length > 0 ? rest : Object.keys(data)) {
    if (!Object.hasOwn(data, name)) stop(`${name} is not recorded in ${TOOL_VERSIONS}; add it with --add ${name} --repository <url>`);
    bases.set(name, data[name]);
  }
  if (bases.size === 0) stop(`${TOOL_VERSIONS} records no package`);
} else {
  const options = new Map();
  const [name, ...flags] = rest;
  for (let i = 0; i < flags.length; i += 2) options.set(flags[i], flags[i + 1]);
  const known = ['--repository', '--hold', '--hold-reason', '--provenance-exception'];
  if (!PACKAGE.test(name ?? '') || flags.length % 2 === 1 || [...options.keys()].some((key) => !known.includes(key))) stop(USAGE, 2);
  if (Object.hasOwn(data, name)) stop(`${name} is already recorded; refresh it, or edit its hold in ${TOOL_VERSIONS} and check the file`);
  const [repository, hold, holdReason, exception] = known.map((key) => options.get(key));
  if (!REPOSITORY.test(repository ?? '')) stop('--repository must be https://github.com/<owner>/<repo>', 2);
  if ((hold === undefined) !== (holdReason === undefined) || (hold !== undefined && !HOLD.test(hold))) stop('--hold takes a line such as 2 or 2.1 together with --hold-reason', 2);
  bases.set(name, Object.fromEntries(Object.entries({ repository, hold, holdReason, provenanceException: exception }).filter(([, value]) => value !== undefined)));
}

const registryRoot = { meta: (name) => registry.meta(ROOT, name), versionInfo: (name, version) => registry.versionInfo(ROOT, name, version),
  attestations: registry.attestations };
const result = await refresh(data, bases, registryRoot);
console.log(result.lines.join('\n'));
if (result.changed) {
  try {
    if (lstatSync(join(ROOT, TOOL_VERSIONS), { throwIfNoEntry: false })?.isSymbolicLink()) throw Object.assign(new Error('link'), { code: 'ELOOP' });
    writeFileSync(join(ROOT, TOOL_VERSIONS), `${JSON.stringify(result.data, null, 2)}\n`);
  } catch (error) {
    const protectedFile = ['EPERM', 'EACCES', 'EROFS'].includes(error.code);
    stop(`cannot write ${TOOL_VERSIONS} (${error.code ?? error.message})${protectedFile ? '; it is protected from commands confined by the client sandbox, so run '
      + 'this command outside the sandbox, with the approval the client asks for (.readme/91-agent-sandbox.md)' : ''}; nothing was recorded`);
  }
}
process.exitCode = result.failed ? 1 : 0;
