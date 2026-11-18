import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { patchPlan, ROOT, run, startRepo } from './support.mjs';

const skills = join(ROOT, '.agents', 'skills');

export const evidenceGuidance = () => readFileSync(join(skills, 'prompt-plan', 'references', 'execution.md'), 'utf8');
export const implementationGuidance = () => readFileSync(join(skills, 'prompt', 'references', 'implementation-prompts.md'), 'utf8');
export const json = (value) => `${JSON.stringify(value)}\n`;

export function closurePlan(t, files = {}) {
  const repo = startRepo(t, files);
  const { plan, patch } = patchPlan(repo, ['01']);
  const check = join(plan, 'check');
  mkdirSync(check);
  for (const name of ['lib', 'state', 'evidence']) {
    cpSync(join(skills, 'prompt-plan', 'scripts', 'node', `check-${name}.mjs`), join(check, `${name}.mjs`));
  }
  const node = (file, args = [], input) => run(process.execPath, [file, ...args], { cwd: repo.dir, input, timeout: 10_000 });
  const save = (name, output) => {
    const saved = node(join(check, 'evidence.mjs'), ['01', name, 'txt'], output);
    assert.equal(saved.status, 0, saved.stderr);
    return join(repo.dir, saved.stdout.trim());
  };
  return { repo, plan, check, patch, node, save };
}

// These programs stand in for project-owned commands and state in a disposable consumer.
export const countSamples = `
const events = Array.from({ length: 55 }, (_, index) => index % 7 === 0 ? 'trigger' : 'capture');
console.log('Captures:', events.filter((event) => event === 'capture').length);
console.log('Triggers:', events.filter((event) => event === 'trigger').length);
`;

export const applyMigration = `
import { readFileSync, writeFileSync } from 'node:fs';
const [target, review, authorization] = process.argv.slice(2);
if (target === 'persistent' && (review !== 'passed' || authorization !== 'authorized')) {
  console.log(JSON.stringify({ target, review, authorization, outcome: 'blocked' }));
  process.exit(1);
}
const path = '.temp/' + target + '.json';
const state = JSON.parse(readFileSync(path, 'utf8'));
state.history.push('0122');
state.rows = state.rows.map((row) => ({ ...row, active: true }));
writeFileSync(path, JSON.stringify(state));
console.log(JSON.stringify({ target, review, authorization, outcome: 'applied', state }));
`;

export const checkHistory = `
import { readFileSync } from 'node:fs';
const history = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const migration = '0122';
const dependency = '0121';
if (history.filter((id) => id === migration).length !== 1) {
  console.error('0122 must appear exactly once');
  process.exit(1);
}
if (!history.includes(dependency) || history.indexOf(dependency) >= history.indexOf(migration)) {
  console.error('0121 must precede 0122');
  process.exit(1);
}
console.log('0122 follows 0121 in', history.join(', '));
`;

export const checkDeliveredBasis = String.raw`
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { condition, planDir, root, runChecks } from './lib.mjs';
const expected = JSON.parse(readFileSync(join(planDir, 'build', '01-assumptions.json'), 'utf8'));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 5000 }).trim();
const delivered = { revision, ...JSON.parse(readFileSync(join(root, 'consumer.json'), 'utf8')) };
const differences = Object.entries(expected).flatMap(([field, value]) =>
  delivered[field] === value ? [] : [field + ': ' + value + ' -> ' + delivered[field]]);
runChecks('01', [condition('C13', 'Compare pending assumptions with delivered state', !differences.length,
  ['build/01-assumptions.json, consumer.json and git rev-parse HEAD', ...differences].join('\n'))]);
`;
