// A fixture for the run-pinned tests: a copy of the script under .temp/ beside the files it reads, run against stand-ins
// for npm's CLI scripts.

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, run } from './support.mjs';

export const HEADER = '| Package | Version | License | Origin | Verification |\n| --- | --- | --- | --- | --- |\n';
export const table = (rows) => HEADER + rows.map(([name, version]) => `| \`${name}\` | ${version} | MIT | origin | checked |\n`).join('');
export const stack = (project = []) => `# Technology Stack\n\n## Template Tooling\n\ngenerated\n\n## Project Tooling\n\n${table(project)}`;
// The tool versions file with a valid entry for each [name, version].
export const tools = (rows) => JSON.stringify(Object.fromEntries(rows.map(([name, version]) => [name, { version, integrity: `sha512-${'A'.repeat(86)}==`,
  published: '2026-01-01T00:00:00.000Z', resolved: '2026-02-01T00:00:00.000Z', repository: 'https://github.com/o/r', license: 'MIT' }])));
export const PIN = /^[a-z-]+@\d+\.\d+\.\d+$/;

// A copy of the script beside a .docs/stack.md, a .agents/tool-versions.json and stand-ins for npm's CLI scripts,
// which print the arguments they receive instead of reaching the registry.
export function fixture(t, text, file) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.temp', 'run-pinned-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  mkdirSync(join(dir, '.scripts'));
  mkdirSync(join(dir, 'npm'));
  for (const script of ['run-pinned.mjs', 'npm-cli.mjs', 'tool-versions-file.mjs']) cpSync(join(ROOT, '.scripts', script), join(dir, '.scripts', script));
  for (const name of ['npm-cli.js', 'npx-cli.js']) {
    writeFileSync(join(dir, 'npm', name),
      `console.log(JSON.stringify([${JSON.stringify(name)}, ...process.argv.slice(2), process.env.npm_config_cache]));\nprocess.exit(Number(process.env.FAKE_STATUS ?? 0));\n`);
  }
  if (text !== undefined) {
    mkdirSync(join(dir, '.docs'));
    writeFileSync(join(dir, '.docs', 'stack.md'), text);
  }
  if (file !== undefined) {
    mkdirSync(join(dir, '.agents'));
    writeFileSync(join(dir, '.agents', 'tool-versions.json'), file);
  }
  const pinned = (args, env = {}) => run(process.execPath, [join(dir, '.scripts', 'run-pinned.mjs'), ...args],
    { cwd: join(dir, 'npm'), env: { ...process.env, PINNED_NPM_CLI_DIR: join(dir, 'npm'), ...env } });
  pinned.cache = join(dir, '.temp', 'npm-cache');
  return pinned;
}

