import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, run, hookFor, runClientHook } from './support.mjs';

const header = '| ID | Reportado | Componente | Versión afectada | Severidad | Impacto de seguridad | Estado | Corregido en | Evidencia |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n';
const row = (id, state, component = 'x') => `| ${id} | x | ${component} | x | x | x | ${state} | x | x |\n`;
const doc = (active = '', closed = '') => `# Bugs\n\n## Activos\n\n${header}${active}\n## Cerrados\n\n${header}${closed}`;
const todo = '| TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |\n';
function check(repo, contents) {
  repo.write('.docs/bugs.md', contents);
  const result = repo.script('check-bugs.mjs');
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('valid empty tables, placeholder, closed-only and all states', (t) => {
  const repo = makeRepo(t);
  for (const text of [doc(), doc(todo), doc('', row('BUG-0001', 'descartado')),
    doc(['nuevo', 'reproducido', 'en_curso', 'bloqueado'].map((s, i) => row(`BUG-000${i + 1}`, s)).join(''),
      row('BUG-0005', 'resuelto') + row('BUG-0006', 'descartado'))]) assert.equal(check(repo, text), '');
});

test('reports the English states of earlier versions until they are translated', (t) => {
  const repo = makeRepo(t);
  const output = check(repo, doc(row('BUG-0001', 'confirmed'), row('BUG-0002', 'resolved')));
  assert.equal(output.trim().split('\n').length, 2);
  assert.match(output, /state is invalid for its section/);
});

test('reports each misplaced state, duplicate and placeholder coexistence without row contents', (t) => {
  const repo = makeRepo(t);
  const output = check(repo, doc(todo + row('BUG-0001', 'descartado', 'private evidence') + row('BUG-0001', 'nuevo'),
    row('BUG-0001', 'bloqueado')));
  assert.equal(output.trim().split('\n').length, 5);
  assert.match(output, /bugs\.md:\d+/);
  assert.match(output, /10-documents/);
  assert.doesNotMatch(output, /private evidence|BUG-0001/);
  assert.match(check(repo, doc(todo, row('BUG-0002', 'descartado'))), /TODO/);
});

test('duplicate IDs within and across sections, and TODO with an active bug', (t) => {
  const repo = makeRepo(t);
  assert.match(check(repo, doc(row('BUG-0001', 'nuevo') + row('BUG-0001', 'reproducido'))), /duplicate ID/);
  assert.match(check(repo, doc(row('BUG-0001', 'nuevo'), row('BUG-0001', 'descartado'))), /duplicate ID/);
  assert.match(check(repo, doc(todo + row('BUG-0001', 'nuevo'))), /TODO/);
});

test('inline code, escaped pipes, empty cells and fenced examples preserve columns', (t) => {
  const repo = makeRepo(t);
  const text = doc(row('`BUG-0001`', '`nuevo`', 'a \\| b') + '| BUG-0002 | | x | x | x | x | descartado | x | x |\n'
    + '```text\n' + row('BUG-0001', 'descartado') + '```\n');
  const output = check(repo, text);
  assert.equal(output.trim().split('\n').length, 1);
  assert.match(output, /state/i);
});

test('missing file, subdirectory, independent nested repository and symlinks', (t) => {
  const repo = makeRepo(t);
  assert.equal(repo.script('check-bugs.mjs').stdout, '');
  repo.write('.docs/bugs.md', doc(row('BUG-0001', 'descartado')));
  mkdirSync(join(repo.dir, 'sub'));
  const script = join(repo.dir, '.scripts/check-bugs.mjs');
  assert.equal(run(process.execPath, [script], { cwd: join(repo.dir, '..') }).stdout, '');
  assert.match(run(process.execPath, [script], { cwd: join(repo.dir, 'sub') }).stdout, /state/i);
  const nested = join(repo.dir, 'sub');
  assert.equal(run('git', ['init', '-q', nested]).status, 0);
  assert.equal(run(process.execPath, [script], { cwd: nested }).stdout, '');
  const other = makeRepo(t);
  other.write('external.md', doc(row('BUG-0001', 'descartado')));
  const linkRepo = makeRepo(t);
  mkdirSync(join(linkRepo.dir, '.docs'));
  try { symlinkSync(join(other.dir, 'external.md'), join(linkRepo.dir, '.docs/bugs.md')); }
  catch (error) { if (error.code === 'EPERM') return; throw error; }
  assert.equal(linkRepo.script('check-bugs.mjs').stdout, '');
  const dirLinkRepo = makeRepo(t);
  try { symlinkSync(join(other.dir, '.docs'), join(dirLinkRepo.dir, '.docs'), 'dir'); }
  catch (error) { if (error.code === 'EPERM') return; throw error; }
  other.write('.docs/bugs.md', doc(row('BUG-0001', 'descartado')));
  assert.equal(dirLinkRepo.script('check-bugs.mjs').stdout, '');
});

test('both client prompt hooks execute the shared checker', (t) => {
  const repo = makeRepo(t);
  repo.write('.docs/bugs.md', doc(row('BUG-0001', 'descartado')));
  for (const client of ['claude', 'codex']) {
    const result = runClientHook(client, hookFor(client, 'UserPromptSubmit', 'check-bugs.mjs'), repo);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /state/i);
  }
});

test('tables outside the sections, unknown and empty states, and quoted headings', (t) => {
  const repo = makeRepo(t);
  assert.match(check(repo, `# Bugs\n\n${header}${row('BUG-0001', 'resuelto')}`), /outside Activos and Cerrados/);
  assert.match(check(repo, doc() + `\n## Notas\n\n${header}${row('BUG-0002', 'nuevo')}`), /outside Activos and Cerrados/);
  for (const state of ['fixed', '']) assert.match(check(repo, doc('', row('BUG-0001', state))), /state is invalid/);
  assert.match(check(repo, `# Bugs\n\n## Activos\n\n> ## Cerrados\n\n${header}${row('BUG-0001', 'resuelto')}`),
    /state is invalid/);
  assert.equal(check(repo, doc() + '\n## Notas\n\n| A | B |\n| --- | --- |\n| x | y |\n'), '');
});

test('the time grows linearly with the number of tables', (t) => {
  const repo = makeRepo(t);
  const tables = Array.from({ length: 16000 }, (_, i) => `\n## Activos\n\n${header}${row(`BUG-${i}`, 'nuevo')}`);
  repo.write('.docs/bugs.md', `# Bugs\n${tables.join('')}`);
  const start = performance.now();
  const result = repo.script('check-bugs.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.ok(performance.now() - start < 3000, 'quadratic in the number of tables');
});
