// A fixture for the tool-versions.mjs tests: a copy of the script under .temp/ with a tool versions file and a stand-in
// for npm that answers `npm view` from the metadata the test gives it and logs what it was asked.

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, run } from './support.mjs';

export const INTEGRITY = `sha512-${'B'.repeat(86)}==`;
export const entry = (change = {}) => ({ version: '1.0.0', integrity: INTEGRITY, published: '2026-01-01T00:00:00.000Z', resolved: '2026-02-01T00:00:00.000Z',
  repository: 'https://github.com/o/r', license: 'MIT', ...change });

// `file` is the content of .agents/tool-versions.json (undefined for none); `meta` what the stand-in npm answers for a package.
export function fixture(t, file, meta = { latest: '1.2.0', times: { '1.2.0': '2026-01-10T00:00:00.000Z', '1.0.0': '2026-01-01T00:00:00.000Z' } }) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.temp', 'tool-versions-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  mkdirSync(join(dir, '.scripts'));
  mkdirSync(join(dir, 'npm'));
  for (const name of ['tool-versions', 'tool-versions-file', 'tool-versions-select', 'tool-versions-refresh', 'tool-versions-registry', 'npm-cli']) {
    cpSync(join(ROOT, '.scripts', `${name}.mjs`), join(dir, '.scripts', `${name}.mjs`));
  }
  if (file !== undefined) {
    mkdirSync(join(dir, '.agents'));
    writeFileSync(join(dir, '.agents', 'tool-versions.json'), typeof file === 'string' ? file : JSON.stringify(file));
  }
  writeFileSync(join(dir, 'npm', 'package.json'), '{ "type": "commonjs" }\n');
  writeFileSync(join(dir, 'npm', 'npx-cli.js'), '');
  writeFileSync(join(dir, 'npm', 'npm-cli.js'), `const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(join(dir, 'npm.log'))}, JSON.stringify({ cwd: process.cwd(), proxy: process.env.NODE_USE_ENV_PROXY, args }) + '\\n');
const meta = ${JSON.stringify(meta)};
const versions = Object.keys(meta.times);
const time = { created: meta.times[versions[0]], ...meta.times };
const answer = args[1].includes('@') ? { 'dist.integrity': ${JSON.stringify(INTEGRITY)}, license: 'MIT', 'repository.url': 'git+https://github.com/o/r.git' }
  : { time, 'dist-tags': { latest: meta.latest }, versions };
console.log(JSON.stringify([answer]));
`);
  const cli = (args, env = {}) => run(process.execPath, [join(dir, '.scripts', 'tool-versions.mjs'), ...args],
    { cwd: dir, env: { ...process.env, PINNED_NPM_CLI_DIR: join(dir, 'npm'), ...env } });
  cli.dir = dir;
  cli.file = () => JSON.parse(readFileSync(join(dir, '.agents', 'tool-versions.json'), 'utf8'));
  cli.calls = () => readFileSync(join(dir, 'npm.log'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  return cli;
}
