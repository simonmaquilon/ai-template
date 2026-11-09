import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT } from './support.mjs';
import { guideCovers, namedTemplateOnly, startCovers } from './template-only-permissions.mjs';

// A derived project never has the template-only files, so the sandbox exemptions and allow rules that name them
// must be removed with the files. This keeps the cleanup in `start` and the adoption guide in step with the
// entries `.claude/settings.json` carries.
const text = (path) => readFileSync(join(ROOT, path), 'utf8');

test('the template-only paths that settings.json exempts or allows are exactly the known ones', () => {
  assert.deepEqual(namedTemplateOnly(text('.claude/settings.json')), ['.scripts/run-checks.mjs']);
});

test('the start skill and the adoption guide remove every template-only entry of settings.json', () => {
  const start = text('.agents/skills/start/SKILL.md');
  const guide = text('.readme/96-template-adoption.md');
  for (const path of namedTemplateOnly(text('.claude/settings.json'))) {
    assert.ok(startCovers(start, path), `start does not say in Workflow to remove the entries of ${path}`);
    for (const heading of ['Adoptar la plantilla en un proyecto existente', 'Traer los cambios']) {
      assert.ok(guideCovers(guide, heading, path), `«${heading}» does not say to remove the entries of ${path}`);
    }
  }
});
