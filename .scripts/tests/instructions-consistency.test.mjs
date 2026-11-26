// Findings of the consistency audit of the rule layer: each rule has one meaning, one home and one scope, and the
// documents that describe the same fact say it the same way.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT } from './support.mjs';

const text = (...path) => readFileSync(join(ROOT, ...path), 'utf8');
const module = (name) => text('.agents', 'instructions', name);
const rules = (body) => body.split('\n').filter((line) => line.startsWith('- '));
const release = module('12-version-control.md');
const SCOPE = 'before an authorized staging, commit, ignore-rule change, pull request, version raise, pre-release audit, tag, or release publication, '
  + 'and before introducing a path that must stay untracked.';
const ci = text('.readme', '94-template-ci.md');
const adoption = text('.readme', '96-template-adoption.md');

test('12 scopes itself, and AGENTS.md routes it, to the version raise, the audit, the tag and the publication it regulates', () => {
  assert.equal(release.split('\n')[2], `Read ${SCOPE}`);
  assert.ok(text('AGENTS.md').split('\n').includes(`- \`12-version-control.md\`: ${SCOPE}`));
});

test('every release rule of 12 starts in the maintained template, and none redefines it', () => {
  const release_ = rules(release).filter((line) => /release|template-version|template-manifest/.test(line) && !/^- Files that only validate/.test(line));
  assert.ok(release_.length >= 7);
  for (const rule of release_) assert.match(rule, /^- In the maintained template,/, rule);
  assert.doesNotMatch(release, /whose `origin`/);
  assert.match(module('01-meta-guidelines.md'), /^- The maintained template is the repository whose `origin`/m);
});

test('the missing automation of the tag rule is a commit without a run, and the release rule keeps its notes', () => {
  const [tag, ...extra] = rules(release).filter((line) => /never push a release tag/.test(line));
  assert.equal(extra.length, 0);
  assert.match(tag, /with automation active/);
  assert.match(tag, /missing means no run of that commit exists/);
  const [rule] = rules(release).filter((line) => /node \.scripts\/release\.mjs/.test(line));
  assert.match(rule, /run `node \.scripts\/release\.mjs` with its release notes/);
  assert.match(rule, /when no automation is active it publishes and says so/);
});

test('the template-only prefixes of .readme/ are spelled the same in 01 and 10, and the adoption document agrees with the script', () => {
  assert.match(module('01-meta-guidelines.md'), /documents the template ships, which derived projects inherit except the template-only ones, and make their own the few the template declares project-owned/);
  assert.doesNotMatch(module('10-documents.md'), /project-owned documents take prefixes below `90`/);
  assert.match(module('10-documents.md'), /a derived project's new documents take prefixes below `90`/);
  const owned = readFileSync(join(ROOT, '.scripts', 'template-files.mjs'), 'utf8').match(/PROJECT_OWNED = \[([^\]]*)\]/)[1];
  for (const file of ['.readme/91-agent-sandbox.md', '.readme/95-agent-tool-servers.md']) {
    assert.ok(owned.includes(file), file);
    assert.ok(adoption.includes(`\`${file}\``), file);
  }
});

test('the adoption document defines the maintained template as 01 does: HEAD tracks the marker, on disk or not', () => {
  const [definition] = adoption.split('\n').filter((line) => line.startsWith('La plantilla mantenida es'));
  assert.match(definition, /que tiene en `HEAD` su workflow de CI, `template-checks\.yml`, o el documento de `\.readme\/` que lo describe, esté o no aún en disco/);
  assert.equal(definition.includes('en `HEAD` y en disco'), false);
});

test('the Trivial level loads the modules routed for the files it edits and for the commands it runs', () => {
  const trivial = text('AGENTS.md').split('\n').find((line) => line.startsWith('| Trivial |'));
  assert.ok(trivial.includes('| the modules routed for the files it edits and the commands it runs |'), trivial);
});

test('the sandbox-exempt command is run alone in its exact form, and treated as blocked only after that', () => {
  const lines = rules(module('16-command-execution.md'));
  const [form] = lines.filter((line) => line.startsWith('- Run a command the client settings exempt from the sandbox alone'));
  assert.ok(form.includes('never redirected, piped, chained, or prefixed'));
  assert.match(form, /because any other form can confine it\.$/);
  assert.doesNotMatch(form, /before treating it as blocked/);
  const [blocked] = lines.filter((line) => /only after running it that way/.test(line));
  assert.match(blocked, /^- Treat a sandbox-exempt command as blocked only after running it that way, reading its output from the background task's output or from its script's log\.$/);
});

test('03 keeps .temp/ out of repository evidence but accepts a run log as the source of its own figures, and bans other temporary folders', () => {
  const code = module('03-code-authoring.md');
  assert.match(code, /never cite it as evidence of the repository, count it in usage sweeps/);
  assert.match(code, /the log of a run there is the source of that run's own figures/);
  assert.doesNotMatch(code, /except a system temporary folder/);
  assert.match(code, /never use a system temporary folder or the client's session scratchpad, since `\.temp\/` replaces them\.$/m);
});

test('the template CI document lists every file that only validates the template, as the script does', () => {
  const only = readFileSync(join(ROOT, '.scripts', 'template-files.mjs'), 'utf8').match(/TEMPLATE_ONLY = \[([^\]]*)\]/)[1];
  assert.ok(only.includes('check-security-skill.mjs') && only.includes('security-skill-hash.mjs'));
  const [line] = ci.split('\n').filter((row) => row.startsWith('Este CI, '));
  for (const name of ['run-checks.mjs', 'check-security-skill.mjs', 'security-skill-hash.mjs', 'este documento']) assert.ok(line.includes(name), name);
});

test('the template CI document says the plan hook closes a line by its answered mark and receipt, and the auditor only reports', () => {
  assert.equal(ci.includes('sin preguntar ni aceptar'), false);
  assert.ok(ci.includes('líneas ⏳, ⚠️ o 🚫 abiertas, que solo se cierran con la marca `[answered AAAA-MM-DD P-01]` y el recibo que el hook registró para ese ID'));
  assert.ok(ci.includes('las marcas de pregunta y de aceptación son solo historial'));
  const section = ci.slice(ci.indexOf('## Publicar una versión'));
  const before = section.slice(0, section.indexOf('**Encargo de la auditoría**'));
  assert.match(before, /Quien audita solo identifica e informa, y sus hallazgos confirmados se resuelven en el cambio de la versión antes de publicar:/);
  assert.ok(section.includes('> Evalúa sus responsabilidades, dependencias, jerarquías e interacciones. Identifica inconsistencias'));
});
