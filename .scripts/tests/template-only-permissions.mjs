// Pure checks, over the texts they read, that the cleanup in `start` and the adoption guide cover every template-only
// path that `.claude/settings.json` exempts from the sandbox or allows without asking.
import { TEMPLATE_ONLY } from '../template-manifest.mjs';

// Every template-only path that a sandbox exclusion or an allow rule names; a directory covers what lies below it.
export function namedTemplateOnly(settingsText) {
  const settings = JSON.parse(settingsText);
  const entries = [...(settings.sandbox?.excludedCommands ?? []), ...(settings.permissions?.allow ?? [])];
  return TEMPLATE_ONLY.filter((path) => entries.some((entry) => entry.includes(path))).sort();
}

const section = (body, heading) => body.split(/^## /m).find((part) => part.startsWith(`${heading}\n`)) ?? '';

// `start` removes the entries in its Workflow section, on a line that names the setting and says to remove.
export const startCovers = (startText, path) =>
  section(startText, 'Workflow')
    .split('\n')
    .some((line) => line.includes('excludedCommands') && /\bremove\b/i.test(line) && line.includes(path));

// The guide removes them in a prose line that names the setting and says «quita» or «quítalas»; the path may sit in
// that line or in the fenced block that follows it, never in the block alone.
export function guideCovers(guideText, heading, path) {
  const lines = section(guideText, heading).split('\n');
  return lines.some((line, at) => {
    if (!line.includes('excludedCommands') || !/\bqu[ií]ta(las)?\b/i.test(line)) return false;
    let end = at;
    const open = lines.findIndex((next, i) => i > at && i <= at + 3 && /^\s*```/.test(next));
    if (open > 0) end = lines.findIndex((next, i) => i > open && /^\s*```/.test(next));
    return lines.slice(at, end + 1).join('\n').includes(path);
  });
}
