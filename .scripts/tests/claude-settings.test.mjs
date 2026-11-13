import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT } from './support.mjs';

const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'));

test('the shared Claude Code settings enable task tracking on every model', () => {
  assert.equal(settings.env?.CLAUDE_CODE_ENABLE_TODO_TOOLS, '1');
});

test('the shared Claude Code settings return the shell to the project directory after each command', () => {
  assert.equal(settings.env?.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR, '1');
});
