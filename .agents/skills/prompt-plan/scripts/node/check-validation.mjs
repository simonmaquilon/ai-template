// Checks a runner-specific adapter's required cases and completed results. The adapter supplies repository-relative
// spec names, stable case IDs, exact documented error signatures, and results of any isolated repetitions.
const caseKey = ({ spec, id }) => JSON.stringify([spec, id]);

function index(items) {
  const found = new Map();
  for (const item of items) {
    const key = caseKey(item);
    found.set(key, found.has(key) ? null : item);
  }
  return found;
}

export function verifyRequiredE2E({ required, results, complete, known = [], retry = [] }) {
  const outcomes = index(results);
  const repetitions = index(retry);
  const inventory = index(required);
  const allowed = new Set(known.filter(({ signature }) => typeof signature === 'string' && signature.trim())
    .map((item) => JSON.stringify([caseKey(item), item.signature])));
  const issues = required.flatMap(({ spec, id }) => {
    const key = caseKey({ spec, id });
    const attempt = outcomes.get(key);
    let result;
    if (!spec || !id || !inventory.get(key) || attempt === null) result = 'invalid-inventory';
    else if (!attempt) result = 'missing';
    else if (attempt.status === 'passed') return [];
    else if (attempt.status === 'failed' && repetitions.get(key)?.status === 'passed'
      && allowed.has(JSON.stringify([key, attempt.signature]))) result = 'intermittent';
    else result = ['skipped', 'cancelled', 'not-run'].includes(attempt.status) ? attempt.status : 'failed';
    return [{ spec, id, result }];
  });
  return { ok: complete === true && required.length > 0 && issues.length === 0, issues };
}

const relativePath = (path) => path.replaceAll('\\', '/').replace(/^\.\//, '');

// The project-specific check identifies changed specs and test support and resolves the compiler output against
// the project root. Both inputs are project-relative paths, including tests colocated with source.
export function missingCompiledTests(requiredTests, compiled) {
  const files = new Set(compiled.map(relativePath));
  return [...new Set(requiredTests.map(relativePath))].filter((path) => !files.has(path));
}
