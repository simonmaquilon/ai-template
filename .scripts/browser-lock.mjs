// Compares what npm recorded in node_modules/.package-lock.json of the folder browser.mjs installs Playwright in with what
// .agents/tool-versions.json records, without hashing the installed content again: for each recorded package, the
// version and, when recorded, the integrity hash, and that no other copy of it is nested under another package, which
// Node would load instead.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The packages whose npm record must match: playwright-core, which at least has the version of playwright when the entry
// does not pin it, the recorded dependencies, and last playwright itself, so that no dependency can replace its entry.
export const expectedPackages = ({ version, integrity, dependencies = {} }) =>
  ({ 'playwright-core': { version }, ...dependencies, playwright: { version, integrity } });

// A sentence saying how the folder differs from `expected`, a map of package name to { version, integrity? }, or
// undefined when it does not. `source` names the file that records them.
export function lockMismatch(dir, expected, source) {
  let packages;
  try {
    packages = JSON.parse(readFileSync(join(dir, 'node_modules', '.package-lock.json'), 'utf8')).packages ?? {};
  } catch {
    packages = {};
  }
  for (const [name, want] of Object.entries(expected)) {
    const nested = Object.keys(packages).find((path) => path.endsWith(`/node_modules/${name}`));
    if (nested) return `a copy of ${name} at ${nested}, which Node would load, and ${source} records no such copy`;
    const found = packages[`node_modules/${name}`] ?? {};
    if (found.version !== want.version || (want.integrity !== undefined && found.integrity !== want.integrity)) {
      return `${name}@${found.version} with ${found.integrity ? `integrity ${found.integrity}` : 'no recorded integrity'}, `
        + `not the ${want.integrity ?? `version ${want.version}`} that ${source} records`;
    }
  }
  return undefined;
}
