// check-plan-stop.mjs --turn-start keeps the turn's marker when the prompt carries a continuation token of either
// stop hook, wherever the client places it, so that no continuation redoes the marker.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { planRepo } from './plan-stop-fixture.mjs';

for (const client of ['claude', 'codex']) {
  test(`${client}: the plan-stop turn start keeps its marker on a continuation prompt and redoes it on a normal one`, (t) => {
    const fixture = planRepo(t, client);
    const marker = join(fixture.repo.dir, '.temp', 'check-plan-stop', `session-${client}`);
    const original = '1700000000000';
    fixture.repo.write(`.temp/check-plan-stop/session-${client}`, original);
    for (const prompt of ['Stop hook feedback: go on. [check-plan-stop:continuation]', 'note\n[check-file-length:continuation]', '[check-file-length:continuation] tail']) {
      assert.equal(fixture.fire('UserPromptSubmit', { prompt }).status, 0);
      assert.equal(readFileSync(marker, 'utf8'), original, prompt);
    }
    assert.equal(fixture.fire('UserPromptSubmit', { prompt: 'a normal prompt' }).status, 0);
    assert.notEqual(readFileSync(marker, 'utf8'), original);
  });
}
