// Throwaway copies of the STACK.md sync scripts beside a STACK.md whose
// blocks are stale and sources that cover every block, some holding values
// that must never reach the document.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, run } from './support.mjs';

export const SHA = 'a'.repeat(40);
export const block = (id) => `<!-- stack:generated ${id} -->\nstale\n<!-- /stack:generated ${id} -->`;
export const IDS = ['runtime', 'package-manager', 'dependencies', 'skills', 'mcp-servers', 'plugins', 'workflows'];
const STACK = `# Technology Stack\n\nWritten by hand.\n\n${IDS.map(block).join('\n\nAlso by hand.\n\n')}\n`;
const SOURCES = {
  'package.json': JSON.stringify({ engines: { node: '>=22' }, packageManager: `pnpm@9.1.0+sha512.${SHA}`,
    dependencies: { vue: '^3.5.0' }, devDependencies: { vitest: '^3.0.0' } }),
  'node_modules/vue/package.json': JSON.stringify({ version: '3.5.13', license: 'MIT' }),
  '.nvmrc': '24\n',
  'skills-lock.json': JSON.stringify({ skills: { nuxt: { source: 'antfu/skills', computedHash: SHA } } }),
  '.agents/skills/own/SKILL.md': '# Own\n',
  '.mcp.json': JSON.stringify({ mcpServers: { docs: { type: 'http', url: 'https://example.invalid/mcp?key=SECRET' } } }),
  '.codex/config.toml': '[mcp_servers.docs]\nurl = "https://example.invalid/mcp?key=SECRET"\n\n[mcp_servers.local]\ncommand = "server --token SECRET"\n',
  '.claude/settings.json': JSON.stringify({ enabledPlugins: { 'typescript-lsp@official': true } }),
  '.github/workflows/ci.yml': `jobs:\n  a:\n    runs-on: \${{ matrix.os }}\n    strategy:\n      matrix:\n        os: [ubuntu-24.04, windows-2025]\n    steps:\n      - uses: actions/checkout@${SHA} # v7.0.1\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 24\n`,
};

export function fixture(t) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.temp', 'sync-stack-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  const write = (path, content) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  };
  for (const name of ['sync-stack.mjs', 'stack-sources.mjs', 'hook-support.mjs']) {
    write(join('.scripts', name), readFileSync(join(ROOT, '.scripts', name)));
  }
  for (const [path, content] of Object.entries(SOURCES)) write(path, content);
  write('STACK.md', STACK);
  return {
    dir,
    write,
    stack: () => readFileSync(join(dir, 'STACK.md'), 'utf8'),
    sync: (input) => run(process.execPath, [join(dir, '.scripts', 'sync-stack.mjs'), ...(input ? ['--hook'] : [])],
      { cwd: dir, input: input && JSON.stringify(input) }),
  };
}
