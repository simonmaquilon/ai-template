// The wording that decides which lines of a prompt-plan report are ⚠️: the general marker rule of AGENTS.md, the triage that
// cites it, the plan in a scratch folder, the one status term, the one rule for a requested execution, the answered mark,
// and the registers a document or a test may cite.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT } from './support.mjs';

const text = (...path) => readFileSync(join(ROOT, ...path), 'utf8');
const read = (path) => text('.agents', 'skills', 'prompt-plan', path);
const rules = (body) => body.split('\n').filter((line) => line.startsWith('- '));
const carries = (body, ...patterns) => rules(body).some((line) => patterns.every((pattern) => pattern.test(line)));

test('AGENTS.md defines ⚠️ as an open risk naming its criterion or the user decision it needs, 🚫 as not verified, and ℹ️ as also preexisting, out of scope, or by design, and keeps its concision rule', () => {
  const agents = text('AGENTS.md');
  assert.ok(carries(agents, /in lists of criteria, checks, or changes with a state, start each line/));
  assert.ok(carries(agents, /⚠️ open risk naming its criterion or the user decision it needs, 🚫 not verified/));
  assert.ok(carries(agents, /🚫 not verified, with its reason/, /ℹ️ note, or preexisting, out-of-scope, or by-design risk/));
  assert.ok(carries(agents, /Lead with the answer, code, or command, directly and concisely\./));
  assert.equal(rules(agents).filter((line) => /⚠️ open risk/.test(line)).length, 1);
});

test('the triage cites the marker rule for what is ⚠️, and adds the residual risk of the delivered work as the fourth class that does not block', () => {
  const triage = read('references/warning-triage.md');
  assert.ok(carries(triage, /marker rule of the project's `AGENTS\.md`/, /decides which lines are ⚠️/));
  assert.ok(carries(triage, /under that rule/, /measurement the plan defers to a named fragment is not due until that fragment executes/, /ℹ️ note, never 🚫 or ⚠️/));
  assert.ok(carries(triage, /under that rule/, /residual risk of the delivered work that prevents closing no criterion is an ℹ️ note/, /only pending decision, its acceptance, the closing report's ⏳ line carries/));
  assert.doesNotMatch(triage, /by design|more specific rule|exceptions/);
  assert.ok(carries(triage, /⚠️ line that already has its own question and ID/, /is not reclassified/));
  assert.ok(carries(triage, /^- Blocking:/, /decision only the user can take/, /other than the acceptance of residual risks/, /closing report/));
  assert.ok(carries(triage, /not blocking/i, /residual risk of the delivered work/, /prevents closing no criterion/, /one ⏳ line/, /execution\.md/));
});

test('a plan the user chose to keep in a scratch folder is an ℹ️ line, and one that stays there without the question is a ⚠️ risk', () => {
  const line = read('SKILL.md').split('\n').find((candidate) => /Whenever the plan stays in such a folder/.test(candidate)) ?? '';
  assert.match(line, /because the user chose it, the report carries that folder as an ℹ️ line/);
  assert.match(line, /without that question under Precedence, the report carries that folder as a ⚠️ risk/);
  assert.match(line, /⚠️ risk that names the decision of where to keep the plan, which only the user can take, so it blocks the question to execute/);
});

test('the status list of the report says done, and the request to execute that came with the skill has one rule', () => {
  const skill = read('SKILL.md');
  assert.match(skill, /Use ✅ done, ❌ failed, ⚠️ open risk, 🚫 not verified/);
  assert.doesNotMatch(skill, /✅ met/);
  const asked = rules(skill).filter((line) => /asked for with the request for this skill/.test(line));
  assert.equal(asked.length, 1);
  assert.equal(rules(skill).filter((line) => /choosing to execute in that question/.test(line)).length, 1);
  assert.match(asked[0], /left undone, which that report says/);
});

test('an answered mark closes the line by itself where no hook keeps receipts, and only against the receipt where one does', () => {
  assert.ok(carries(read('SKILL.md'), /\[answered YYYY-MM-DD P-01\]/, /where the project's hook keeps receipts/, /only against the receipt of that ID/, /where no hook does, the mark closes it by itself/));
  assert.ok(carries(read('references/execution.md'), /\[answered YYYY-MM-DD P-01\]/, /no hook that holds receipts/, /closes the line by itself/, /closes nothing without the receipt/));
  assert.match(text('.readme', '90-agent-skills.md'), /sin ese hook, la marca cierra la línea por sí sola/);
});

test('the agent-skills document counts as ℹ️ only what the triage does, not a guard that already passed', () => {
  const doc = text('.readme', '90-agent-skills.md');
  assert.match(doc, /una comprobación que el ensayo no puede correr y que un fragmento mide al ejecutarse cuenta como ℹ️/i);
  assert.doesNotMatch(doc, /registra como guarda/);
  assert.match(doc, /el riesgo residual del trabajo entregado que no impide cerrar ningún criterio/);
  assert.match(doc, /propia línea ⚠️ con identificador y pregunta propios, que no se reclasifica/);
});

test('commit is invoked by hand only, in both clients, as prompt and start are, and its document says so', () => {
  for (const name of ['prompt', 'start', 'commit']) {
    assert.match(text('.agents', 'skills', name, 'SKILL.md').split('---')[1], /^disable-model-invocation: true$/m, name);
    assert.match(text('.agents', 'skills', name, 'agents', 'openai.yaml'), /^policy:\n {2}allow_implicit_invocation: false\n?$/, name);
  }
  assert.match(text('.readme', '90-agent-skills.md'), /## Invocación de `commit`[\s\S]*`disable-model-invocation`[\s\S]*`allow_implicit_invocation: false`/);
});

test('no document or test cites a BUG identifier that this repository does not register, since a derived project keeps its own', () => {
  const tests = join(ROOT, '.scripts', 'tests');
  const files = readdirSync(tests).filter((name) => /\.test\.mjs$/.test(name) && !/^(?:bugs-check|prompt-plan-warning-markers)\./.test(name)).map((name) => join(tests, name));
  const readme = join(ROOT, '.readme');
  files.push(...readdirSync(readme).filter((name) => name.endsWith('.md')).map((name) => join(readme, name)));
  for (const file of files) assert.doesNotMatch(readFileSync(file, 'utf8'), /BUG-\d{4}/, file);
});
