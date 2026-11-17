// A pure inventory, over the text it reads, of the entries of `.claude/settings.json` that name a template-only file.
// The settings file is sealed in a derived project, so those entries stay there and nothing removes them; the file
// they name never exists in a derived project, and the write-scope guard keeps file tools from creating it.
import { TEMPLATE_ONLY } from '../template-manifest.mjs';

// Every template-only path that a sandbox exclusion or an allow rule names; a directory covers what lies below it.
export function namedTemplateOnly(settingsText) {
  const settings = JSON.parse(settingsText);
  const entries = [...(settings.sandbox?.excludedCommands ?? []), ...(settings.permissions?.allow ?? [])];
  return TEMPLATE_ONLY.filter((path) => entries.some((entry) => entry.includes(path))).sort();
}

// The entries that name one of those paths, in file order, as { list, entry }.
export function templateOnlyEntries(settingsText) {
  const settings = JSON.parse(settingsText);
  return [['sandbox.excludedCommands', settings.sandbox?.excludedCommands], ['permissions.allow', settings.permissions?.allow]]
    .flatMap(([list, entries]) => (entries ?? []).filter((entry) => TEMPLATE_ONLY.some((path) => entry.includes(path))).map((entry) => ({ list, entry })));
}
