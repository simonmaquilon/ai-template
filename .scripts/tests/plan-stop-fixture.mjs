// A throwaway repository with prompt-plan plans under .temp/plans/, and the plan-stop hook fired the way each client
// fires it, for the plan-stop tests.

import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { hookFor, makeRepo, runClientHook } from './support.mjs';

export const DONE = '| [01](01-step.md) | Step | AC1 | | done |\n';
// A fixed date for the marks, so that every test reads the same report whatever day it runs.
export const ASKED = '[asked the user 2026-01-05]';
export const ACCEPTED = '[accepted by the user 2026-01-05]';
export const answered = (id = 'P-01') => `[answered 2026-01-05 ${id}]`;

export function index(...statuses) {
  const rows = statuses.map((status, i) => `| [0${i + 1}](0${i + 1}-step.md) | Step ${i + 1} | AC${i + 1} | | ${status} |`);
  return ['| Fragment | Objective | Closes | Depends on | Status |', '| --- | --- | --- | --- | --- |', ...rows, ''].join('\n');
}

const age = (path, seconds) => {
  const past = new Date(Date.now() - seconds * 1000);
  utimesSync(path, past, past);
};

// fire(event, input, cwd) runs the hook registered for the event, with input null passed as it stands; turn() starts
// a turn whose marker lies a minute back, so that every later write counts as the turn's; agent(id) does the same for
// a subagent; plan(files, name) writes plan files, with a times.log line unless it is given null, and old() moves
// every plan file written so far back two minutes, before any marker.
export function planRepo(t, client, name = '2026-11-16-change') {
  const repo = makeRepo(t);
  const folder = join(repo.dir, '.temp', 'plans', name);
  const session = `session-${client}`;
  const fire = (event, input = {}, cwd = repo.dir) => runClientHook(client, hookFor(client, event, 'check-plan-stop.mjs'), repo,
    { cwd, input: input === null ? null : { session_id: session, hook_event_name: event, cwd, ...input } });
  const markers = join(repo.dir, '.temp', 'check-plan-stop');
  const written = [];
  return {
    repo,
    folder,
    fire,
    turn() {
      fire('UserPromptSubmit');
      age(join(markers, session), 60);
    },
    agent(id) {
      fire('SubagentStart', { agent_id: id, agent_type: 'general-purpose' });
      age(join(markers, `${session}--${id}`), 60);
    },
    plan(files, other = name) {
      const base = join(repo.dir, '.temp', 'plans', other);
      for (const [path, text] of Object.entries({ 'review/times.log': '2026-11-16T10:00:00Z\t01\tStep\n', ...files })) {
        if (text === null) continue;
        mkdirSync(dirname(join(base, path)), { recursive: true });
        writeFileSync(join(base, path), text);
        written.push(join(base, path), join(base, dirname(path)));
      }
    },
    old() {
      for (const path of written) age(path, 120);
    },
  };
}

// The hook's JSON answer, {} when it printed nothing; it always exits 0 with nothing on stderr.
export function answer(assert, result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return result.stdout.trim() === '' ? {} : JSON.parse(result.stdout);
}
