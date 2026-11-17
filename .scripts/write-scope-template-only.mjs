// Finds the writes of a file tool into the template-only paths a derived project reserves, for the write-scope hook
// (01-meta-guidelines.md). TEMPLATE_ONLY (template-files.mjs) lists what only validates the maintained template, which a
// derived project deletes. Only those paths that a sandbox exclusion or an allow rule of the sealed .claude/settings.json
// names are reserved: that file exempts them from the sandbox and pre-approves them, so a project that created one could
// run its code unconfined; the rest, such as a project's own .scripts/tests/, stay free. A path whose text starts with a
// reserved one is reserved too, whatever the form of the entry (.scripts/run-checks.mjs.bak). The reservation
// applies exactly where the template seal guards a sealed file: not in a copy of the template, not during an adoption, and not without a
// committed manifest. Paths are judged by where they really lead, and letter case never tells two of them apart.
// Everything here reads from the project root.

import { lstatSync, readdirSync } from 'node:fs';
import { relative } from 'node:path';
import { toPosix } from './hook-support.mjs';
import { MANIFEST, TEMPLATE_ONLY, readText } from './template-files.mjs';
import { sealGuard } from './template-seal.mjs';
import { realTarget, within } from './write-scope.mjs';

// The template-only paths, in lower case, that an entry of sandbox.excludedCommands or permissions.allow in the
// project's .claude/settings.json names in its text, read on every call; none when the file is missing or not JSON.
function exempted() {
  try {
    const { sandbox, permissions } = JSON.parse(readText('.claude/settings.json'));
    const entries = [...(sandbox?.excludedCommands ?? []), ...(permissions?.allow ?? [])];
    const texts = entries.filter((entry) => typeof entry === 'string').map((entry) => entry.toLowerCase());
    return TEMPLATE_ONLY.map((entry) => entry.toLowerCase()).filter((path) => texts.some((text) => text.includes(path)));
  } catch {
    return [];
  }
}

// The first of the absolute `paths` that lies in the project at `project` and is reserved, as its path from the
// project root, or null. Throws when a path cannot be resolved.
export function reservedWrite(paths, project) {
  const root = realTarget(project);
  const inside = paths.map(realTarget).filter((path) => within(root, path)).map((path) => toPosix(relative(root, path)));
  if (inside.length === 0) return null;
  process.chdir(project);
  // The seal guards the manifest, which no project owns or excepts, as a sealed file in just those states.
  if (sealGuard(MANIFEST) !== 'sealed') return null;
  const reserved = exempted();
  return inside.find((path) => reserved.some((entry) => path.toLowerCase().startsWith(entry))) ?? null;
}

// The paths of the project root, as written on disk, that a write would reserve and that exist: for each reserved
// entry, the files of its folder whose name starts with it, or the folder itself for an entry ending in /.
export function reservedOnDisk() {
  const found = [];
  for (const entry of exempted()) {
    const slash = entry.lastIndexOf('/') + 1;
    const folder = entry.slice(0, slash);
    if (folder === entry) {
      if (lstatSync(entry, { throwIfNoEntry: false })) found.push(entry);
      continue;
    }
    let names = [];
    try {
      names = readdirSync(folder || '.');
    } catch {}
    found.push(...names.filter((name) => name.toLowerCase().startsWith(entry.slice(slash))).map((name) => folder + name));
  }
  return [...new Set(found)].sort();
}
