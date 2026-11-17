import assert from 'node:assert/strict';
import test from 'node:test';
import { CLAUDE_ONLY, read, scriptOf } from './hook-registry-fixture.mjs';

// Per event, the sorted script names a client file registers through one way of launching them, so a script
// registered twice for the same event counts twice.
function registered(file, nameOf) {
  const hooks = JSON.parse(read(file)).hooks;
  return Object.fromEntries(Object.entries(hooks).map(([event, groups]) => [event, groups.flatMap((group) => group.hooks.map(nameOf)).sort()]));
}

const claude = registered('.claude/settings.json', (hook) => scriptOf(hook.args[0]));

// The "event script" pairs of the table under "## Registro": each backticked event of a row's Evento cell with the script of its Script cell.
function documented() {
  const section = read('.readme/92-agent-hooks.md').split(/^## Registro\s*$/m)[1].split(/^## /m)[0];
  return section.split(/\r?\n/).filter((line) => line.startsWith('|')).slice(2).flatMap((line) => {
    const cells = line.trim().replace(/^\||\|$/g, '').split('|');
    const script = /`\.scripts\/([\w-]+\.mjs)`/.exec(cells[3])?.[1];
    return [...cells[1].matchAll(/`(\w+)`/g)].map(([, event]) => `${event} ${script}`);
  });
}

const shared = Object.fromEntries(Object.entries(claude).filter(([event]) => !(event in CLAUDE_ONLY)));

test('Claude Code, Codex command and Codex commandWindows register the same scripts for every event', () => {
  assert.ok(Object.keys(shared).length > 0);
  assert.deepEqual(registered('.codex/hooks.json', (hook) => scriptOf(hook.command)), shared);
  assert.deepEqual(registered('.codex/hooks.json', (hook) => scriptOf(hook.commandWindows)), shared);
  for (const [event, names] of Object.entries(CLAUDE_ONLY)) assert.deepEqual(claude[event], names, event);
});

test('the registry table in 92-agent-hooks.md lists exactly the scripts the clients register for each event', () => {
  const pairs = Object.entries(claude).flatMap(([event, names]) => names.map((name) => `${event} ${name}`));
  assert.deepEqual([...new Set(documented())].sort(), [...new Set(pairs)].sort());
});
