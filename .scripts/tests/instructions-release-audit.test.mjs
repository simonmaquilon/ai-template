// The consistency audit that precedes a release of the maintained template: two rules of 12-version-control.md that name no
// other module and no tool, and the publishing document that describes the procedure.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT } from './support.mjs';

const text = (...path) => readFileSync(join(ROOT, ...path), 'utf8');
const rules = (body) => body.split('\n').filter((line) => line.startsWith('- '));
const module12 = text('.agents', 'instructions', '12-version-control.md');
const find = (...patterns) => rules(module12).filter((line) => patterns.every((pattern) => pattern.test(line)));
const publishing = () => {
  const doc = text('.readme', '94-template-ci.md');
  return doc.slice(doc.indexOf('## Publicar una versión'));
};
const brief = [
  'Realiza una revisión integral de la plantilla y de todo su ecosistema de configuración y desarrollo, incluyendo hooks, skills, instrucciones, agentes, `AGENTS.md` y demás archivos relacionados.',
  'Evalúa sus responsabilidades, dependencias, jerarquías e interacciones. Identifica y resuelve inconsistencias, contradicciones, redundancias, ambigüedades, solapamientos y vacíos.',
  'Garantiza que todos los componentes estén correctamente articulados, sincronizados y alineados bajo criterios comunes, respetando sus responsabilidades específicas.',
  'El objetivo es dejar una plantilla limpia, consistente, coherente y mantenible, completamente preparada para el desarrollo de software, sin conflictos entre instrucciones, divergencias de implementación ni comportamientos inesperados.',
];

test('a rule has an agent in a clean context that wrote none of the release changes audit the template read-only before the version is raised', () => {
  const [rule, ...extra] = find(/maintained template/, /before raising/, /clean context/, /wrote none of its changes/, /read-only/);
  assert.ok(rule && extra.length === 0);
  assert.match(rule, /the whole template and its configuration/);
});

test('the audit rule names every component of the template and its configuration', () => {
  const [rule] = find(/maintained template/, /before raising/, /read-only/);
  assert.ok(rule, 'falta la regla de auditoría');
  for (const component of ['`AGENTS.md`', 'instruction modules', 'skills', 'hooks', 'declared agents', 'client settings', 'scripts', 'documents', 'tests']) {
    assert.ok(rule.includes(component), `falta el componente ${component}`);
  }
});

test('the follow-up rule says the audit weighs each component and reports the six kinds of finding', () => {
  const [rule, ...extra] = find(/weighs/, /reports/);
  assert.ok(rule && extra.length === 0);
  assert.match(rule, /responsibility, dependencies, hierarchy, and interactions/);
  for (const kind of ['inconsistencies', 'contradictions', 'redundancies', 'ambiguities', 'overlaps', 'gaps']) {
    assert.ok(rule.includes(kind), `falta la clase ${kind}`);
  }
  assert.match(rule, /template-CI `\.readme\/` document keeps/);
});

test('a separate rule forbids publishing with a confirmed finding unresolved unless the user explicitly authorizes it', () => {
  const [rule, ...extra] = find(/maintained template/, /never publish/, /confirmed finding/, /unresolved/, /user explicitly authorizes/);
  assert.ok(rule && extra.length === 0);
});

test('neither audit rule cites another module or names a tool, and the module stays within its limit', () => {
  for (const line of find(/audit/)) assert.doesNotMatch(line, /\d\d-[\w-]+\.md|\.mjs|`[^`]* [^`]*`|\bnode\b|\bgh\b|\bgit\b/);
  assert.ok(Buffer.byteLength(module12) <= 6 * 1024);
});

test('the publishing document describes the audit and says that no script checks it', () => {
  const doc = text('.readme', '94-template-ci.md');
  const section = doc.slice(doc.indexOf('## Publicar una versión'));
  assert.match(section, /agente en un contexto limpio/);
  assert.match(section, /no escribió ninguno de los cambios/);
  assert.match(section, /solo lectura/);
  assert.match(section, /hallazgo confirmado sin resolver/);
  assert.match(section, /autorización explícita del usuario/);
  assert.match(section, /ningún script ni hook/i);
  assert.match(section, /toda la plantilla y su configuración/);
  assert.match(section, /se resuelven en el cambio de la versión antes de publicar/);
});

test('the publishing document quotes the audit brief verbatim as a block quote under its label', () => {
  const section = publishing();
  assert.match(section, /\*\*Encargo de la auditoría\*\*/);
  assert.match(section, /revisión integral de la plantilla/);
  for (const paragraph of brief) assert.ok(section.includes(`> ${paragraph}`), `falta el párrafo del encargo: ${paragraph.slice(0, 40)}`);
});

test('the release hook document says its rule is the one about the CI of the commit', () => {
  assert.match(text('.readme', '92-agent-hooks.md'), /hace cumplir la regla de no publicar un release con el CI de su commit sin pasar de `12-version-control\.md`/);
});
