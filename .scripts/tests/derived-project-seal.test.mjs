// What a project derived from the template is: sealed, not mistaken for the template, with every script its hooks
// register present and none of the scripts it carries depending on a file only the template keeps.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { TEMPLATE_ONLY, listed } from '../template-files.mjs';
import { derivedProject, events, hookEnv, read, registered, start } from './derived-project-fixture.mjs';
import { run } from './support.mjs';

const EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'UserPromptSubmit', 'Stop', 'SubagentStart', 'SubagentStop'];
const IMPORT = /\b(?:import|export)\b[^'"`;()]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
const STATE = `import { pathToFileURL as url } from 'node:url';
const s = await import(url('.scripts/template-seal.mjs').href);
const f = await import(url('.scripts/template-files.mjs').href);
console.log(JSON.stringify([s.sealState().mode, f.isTemplateCheckout(), f.maintainedTemplate().maintained]));`;

test('the derived project is sealed, and is not taken for a copy of the template', (t) => {
  const repo = derivedProject(t);
  const state = run(process.execPath, ['--input-type=module', '-e', STATE], { cwd: repo.dir });
  assert.equal(state.status, 0, state.stderr);
  assert.deepEqual(JSON.parse(state.stdout), ['active', false, false]);
  for (const path of TEMPLATE_ONLY.filter((entry) => !entry.endsWith('/'))) assert.equal(existsSync(join(repo.dir, path)), false, path);
});

for (const client of ['claude', 'codex']) {
  test(`${client}: the seal restores an edited sealed file at the next prompt`, async (t) => {
    const repo = derivedProject(t);
    const original = read(repo, 'AGENTS.md');
    writeFileSync(join(repo.dir, 'AGENTS.md'), 'edited\n');
    const hook = registered(repo, client, 'UserPromptSubmit').find(({ script }) => script === 'check-template-seal.mjs');
    const result = await start(client, hook, repo, hookEnv(t, repo, client), events.prompt);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^- AGENTS\.md: content changed; restored/m);
    assert.equal(read(repo, 'AGENTS.md'), original);
  });
}

test('every script the hooks of both clients register exists in the derived project', (t) => {
  const repo = derivedProject(t);
  const names = new Set();
  for (const client of ['claude', 'codex']) for (const event of EVENTS) for (const { script } of registered(repo, client, event)) names.add(script);
  assert.ok(names.size >= 15, `found ${names.size} registered scripts`);
  assert.deepEqual([...names].filter((name) => !existsSync(join(repo.dir, '.scripts', name))), []);
});

function sources(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') sources(join(dir, entry.name), found);
    else if (entry.isFile() && /\.(?:mjs|cjs|js)$/.test(entry.name)) found.push(join(dir, entry.name));
  }
  return found;
}

test('no script that travels to the derived project imports a template-only module',(t) => {
  const repo = derivedProject(t);
  const files = [...sources(join(repo.dir, '.scripts')), ...sources(join(repo.dir, '.agents', 'skills'))];
  assert.ok(files.length >= 40, `scanned ${files.length} scripts`);
  const problems = [];
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const specifier = match.slice(1).find(Boolean);
      if (!specifier.startsWith('.')) continue;
      const target = join(dirname(file), specifier);
      const path = relative(repo.dir, target).split('\\').join('/');
      const from = relative(repo.dir, file).split('\\').join('/');
      if (listed(TEMPLATE_ONLY, path)) problems.push(`${from} imports ${specifier}, which only the template keeps`);
    }
  }
  assert.deepEqual(problems, []);
});
