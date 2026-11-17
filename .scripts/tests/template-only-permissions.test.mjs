import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT } from './support.mjs';
import { namedTemplateOnly, templateOnlyEntries } from './template-only-permissions.mjs';

// `.claude/settings.json` is sealed in a derived project, so the sandbox exemption and the allow rules that name a
// template-only file stay in it. This inventory keeps them exactly the known five: any other entry that names such a
// file is a new one to decide on.
const text = (path) => readFileSync(join(ROOT, path), 'utf8');

test('the template-only paths that settings.json exempts or allows are exactly the known ones', () => {
  assert.deepEqual(namedTemplateOnly(text('.claude/settings.json')), ['.scripts/run-checks.mjs']);
});

test('the entries of settings.json that name a template-only file are exactly the five of run-checks.mjs', () => {
  assert.deepEqual(templateOnlyEntries(text('.claude/settings.json')), [
    { list: 'sandbox.excludedCommands', entry: 'node .scripts/run-checks.mjs *' },
    { list: 'permissions.allow', entry: 'Bash(node .scripts/run-checks.mjs)' },
    { list: 'permissions.allow', entry: 'Bash(node .scripts/run-checks.mjs *)' },
    { list: 'permissions.allow', entry: 'PowerShell(node .scripts/run-checks.mjs)' },
    { list: 'permissions.allow', entry: 'PowerShell(node .scripts/run-checks.mjs *)' },
  ]);
});
