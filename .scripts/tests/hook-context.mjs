import assert from 'node:assert/strict';

// Validate the documented non-blocking PostToolUse output contract shared by
// Claude Code and Codex. This is not a live model/client dispatch test.
export function postToolContext(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  if (result.stdout.trim() === '') return '';
  const output = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(output), ['hookSpecificOutput']);
  const specific = output.hookSpecificOutput;
  assert.deepEqual(Object.keys(specific).sort(), ['additionalContext', 'hookEventName']);
  assert.equal(specific.hookEventName, 'PostToolUse');
  assert.equal(typeof specific.additionalContext, 'string');
  assert.ok(specific.additionalContext.trim().length > 0);
  return specific.additionalContext;
}
