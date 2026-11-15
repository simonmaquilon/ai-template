// Reads and validates .agents/tool-versions.json, which records the version, integrity hash, dates, origin repository,
// license and optional hold of each tool the agent configuration runs (06-dependencies-and-stack.md). The launchers
// that run outside the sandbox, run-pinned.mjs, browser.mjs and mobile-server.mjs, import only this module, so it holds no network code.

import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const TOOL_VERSIONS = '.agents/tool-versions.json';
export const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
export const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
export const REPOSITORY = /^https:\/\/github\.com\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\/[A-Za-z0-9_-][A-Za-z0-9_.-]*(?<!\.git)$/;
export const HOLD = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,2}$/;
const FIELDS = ['version', 'integrity', 'published', 'resolved', 'repository', 'license', 'hold', 'holdReason', 'provenanceException', 'dependencies'];
const REQUIRED = ['version', 'integrity', 'published', 'resolved', 'repository', 'license'];
const INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/;
const DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/;

const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim() !== '';

// Whether a version is the held line itself or inside it: hold "2" takes 2.x.y, "2.1" takes 2.1.x, "2.1.3" only that.
export const inLine = (version, hold) => hold === undefined || version === hold || version.startsWith(`${hold}.`);

// What is wrong with one entry, as short sentences; an empty list means it is valid.
export function entryProblems(name, entry) {
  if (!PACKAGE.test(name)) return [`"${name}" is not a package name`];
  if (!plain(entry)) return ['the entry is not an object'];
  const problems = Object.keys(entry).filter((key) => !FIELDS.includes(key)).map((key) => `unknown field "${key}"`);
  const bad = (field, reason) => problems.push(`${field} ${reason}`);
  for (const field of REQUIRED) if (entry[field] === undefined) bad(field, 'is missing');
  if (entry.version !== undefined && !VERSION.test(entry.version)) bad('version', 'is not an exact X.Y.Z version');
  if (entry.integrity !== undefined && !INTEGRITY.test(entry.integrity)) bad('integrity', 'is not a sha512 integrity hash');
  for (const field of ['published', 'resolved']) {
    if (entry[field] !== undefined && !(DATE.test(entry[field]) && Number.isFinite(Date.parse(entry[field])))) bad(field, 'is not a UTC date');
  }
  if (DATE.test(entry.published) && DATE.test(entry.resolved) && Date.parse(entry.published) > Date.parse(entry.resolved)) {
    bad('published', 'is later than resolved');
  }
  if (entry.repository !== undefined && !REPOSITORY.test(entry.repository)) bad('repository', 'is not https://github.com/<owner>/<repo>');
  if (entry.license !== undefined && !text(entry.license)) bad('license', 'is empty');
  if ((entry.hold === undefined) !== (entry.holdReason === undefined)) bad('hold', 'and holdReason go together');
  if (entry.hold !== undefined && !HOLD.test(entry.hold)) bad('hold', 'is not a major, major.minor or exact version line');
  else if (entry.hold !== undefined && VERSION.test(entry.version) && !inLine(entry.version, entry.hold)) bad('version', 'is outside its hold');
  if (entry.holdReason !== undefined && !text(entry.holdReason)) bad('holdReason', 'is empty');
  if (entry.provenanceException !== undefined && !text(entry.provenanceException)) bad('provenanceException', 'is empty');
  if (entry.dependencies !== undefined) problems.push(...dependencyProblems(name, entry.dependencies));
  return problems;
}

// The exact dependencies the entry of `owner` pins, each with its own version and integrity hash.
function dependencyProblems(owner, dependencies) {
  if (!plain(dependencies)) return ['dependencies is not an object'];
  return Object.entries(dependencies).flatMap(([name, value]) => {
    const why = !PACKAGE.test(name) ? 'is not a package name' : name === owner ? 'is the package itself' : !plain(value) ? 'is not an object'
      : Object.keys(value).some((key) => !['version', 'integrity'].includes(key)) ? 'has an unknown field'
        : !VERSION.test(value.version) ? 'has no exact X.Y.Z version' : !INTEGRITY.test(value.integrity) ? 'has no sha512 integrity hash' : null;
    return why ? [`dependencies.${name} ${why}`] : [];
  });
}

// Every problem of the file, each prefixed with its package.
export const fileProblems = (data) => Object.entries(data).flatMap(([name, entry]) => entryProblems(name, entry).map((problem) => `${name}: ${problem}`));

// { data } with the parsed object, null when the file does not exist, or { error } when it cannot be used; a link or
// another kind of file is never read.
export function readToolVersions(root) {
  const path = join(root, TOOL_VERSIONS);
  const stats = lstatSync(path, { throwIfNoEntry: false });
  if (!stats) return { data: null };
  if (!stats.isFile()) return { error: `${TOOL_VERSIONS} is not a regular file` };
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    return plain(data) ? { data } : { error: `${TOOL_VERSIONS} is not a JSON object` };
  } catch {
    return { error: `${TOOL_VERSIONS} is not valid JSON` };
  }
}

// The rows of the generated Template Tooling block of .docs/stack.md; an unusable file makes the block fail to sync.
export function toolingRows(root) {
  const { data, error } = readToolVersions(root);
  if (error) throw new Error(error);
  const problems = fileProblems(data ?? {});
  if (problems.length > 0) throw new Error(`${TOOL_VERSIONS} is invalid: ${problems[0]}`);
  return Object.entries(data ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, entry]) => [
    `\`${name}\``, entry.version, entry.published.slice(0, 10), entry.license,
    `[${entry.repository.slice('https://github.com/'.length)}](${entry.repository})`,
    entry.hold === undefined ? 'none' : `line ${entry.hold}: ${entry.holdReason}`]);
}
