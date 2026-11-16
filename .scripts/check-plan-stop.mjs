#!/usr/bin/env node
// Keeps an execution of a prompt-plan plan from ending while it can still go on within what the user authorized
// (prompt-plan, references/execution.md, Ending an execution): it ends with that work done, or with each item left put
// to the user as a question or accepted by the user. With --turn-start, on UserPromptSubmit, it writes a marker for the
// session's turn under .temp/, unless the prompt carries TOKEN, as the continuation this hook causes does; with
// --agent-start, on SubagentStart, one for the subagent, and records in each plan in execution the open report lines
// the subagent inherits. On Stop and SubagentStop it checks the plans under .temp/plans/ that the turn, or the
// subagent since it started, wrote, as plan-stop.mjs reads them, and blocks the stop with decision "block" and the open
// items as the reason, which both clients hand to the agent as its next instruction. Without a turn marker it checks
// only a plan whose times.log has a fragment's segment open; a subagent without a marker, such as one of the client's
// own, is never checked, nor a stop while a background subagent, workflow, or teammate runs. plan-stop-state.mjs
// bounds the blocks and lets the stop through, with a warning to the user, at its limits or when it cannot keep its
// count; it never relies on stop_hook_active. Its own errors never block: it exits 0 with a warning.

import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { enterRepositoryRoot, readHookInput } from './hook-support.mjs';
import { PLANS, lastTime, openItems, openKeys, opensFragment, planFolders, started, touchedSince } from './plan-stop.mjs';
import { MAX_WINDOW, WINDOW_MINUTES, count, dropState, readState, writeState } from './plan-stop-state.mjs';
import { markTurnStart } from './turn-marker.mjs';

const MARKERS = '.temp/check-plan-stop';
const SHOWN = 25;
const RULE = 'prompt-plan, references/execution.md, Ending an execution';
// A fixed string no person writes, which tells this hook's continuation prompt wherever the client places the reason.
const TOKEN = '[check-plan-stop:continuation]';
const BACKGROUND = new Set(['subagent', 'workflow', 'teammate']);
const start = process.argv.includes('--turn-start') ? 'turn' : process.argv.includes('--agent-start') ? 'agent' : null;
const id = (value) => String(value ?? '').replace(/[^\w-]/g, '_');

function guard(input, root) {
  const session = id(input.session_id);
  const subagent = start === 'agent' || input.hook_event_name === 'SubagentStop';
  const marker = session && (!subagent ? session : id(input.agent_id) && `${session}--${id(input.agent_id)}`);
  const actor = `${subagent ? 'agent' : 'session'}-${marker || 'none'}.json`;
  const markers = join(root, ...MARKERS.split('/'));
  const time = (name) => lstatSync(join(markers, name), { throwIfNoEntry: false })?.mtimeMs ?? null;
  // A marker's identity is the time it holds, which stays the same if anything moves its modification time.
  const identity = () => (time(marker) === null ? null : `marker ${readFileSync(join(markers, marker), 'latin1').slice(0, 20)}`);

  if (start === 'turn' && marker && !String(input.prompt ?? '').includes(TOKEN)) markTurnStart(root, MARKERS, marker);
  if (start === 'agent' && marker) {
    const turn = session ? time(session) : null;
    markTurnStart(root, MARKERS, marker);
    for (const plan of planFolders(root)) {
      try {
        if (started(root, plan) && (turn === null ? opensFragment(lastTime(root, plan)) : touchedSince(root, plan, turn))) {
          writeState(root, plan, actor, { turn: identity(), keys: openKeys(root, plan) });
        }
      } catch {}
    }
  }
  if (start) return {};

  const from = marker ? time(marker) : null;
  if (subagent && from === null) return {};
  if (!subagent && Array.isArray(input.background_tasks) && input.background_tasks.some((task) => BACKGROUND.has(task?.type))) return {};
  // A subagent answers for the before records written after its marker and before the next subagent's of its session.
  const until = subagent ? Math.min(Infinity, ...readdirSync(markers).filter((name) => name.startsWith(`${session}--`) && name !== marker)
    .map(time).filter((other) => other !== null && other > from)) : Infinity;
  const [blocked, notes] = [[], []];
  for (const plan of planFolders(root)) {
    const where = `${PLANS}/${plan}`;
    try {
      if (!started(root, plan)) continue;
      const turn = from === null ? `open ${lastTime(root, plan)}` : identity();
      const stored = readState(root, plan, actor);
      const prior = stored?.turn === turn ? stored : null;
      if (prior?.released) continue;
      if (!(from === null ? opensFragment(lastTime(root, plan)) : touchedSince(root, plan, from) || prior?.fingerprint)) continue;
      const { items, unreadable } = openItems(root, plan, subagent ? { since: from, until, keys: prior?.keys } : null);
      if (unreadable) {
        notes.push(`check-plan-stop: ${where}: could not read ${unreadable.join(' and ')}, so its execution was not checked.`);
        continue;
      }
      if (items.length === 0) {
        if (subagent || !stored?.times?.length) dropState(root, plan, actor);
        else writeState(root, plan, actor, { turn, times: stored.times });
        continue;
      }
      const result = count(root, plan, actor, stored, turn, items);
      if (result.verdict === 'release') {
        if (subagent) dropState(root, plan, actor);
        notes.push(`check-plan-stop (${RULE}): ${where} ended with ${items.length} open items that were neither resolved nor put to you as a question`
          + `${result.lost ? ', and the hook could not keep its count in the plan\'s .cache/, so it let the stop through' : ''}: ${items.slice(0, 5).join('; ')}. Ask the agent to resume them or decide them.`);
        continue;
      }
      const shown = items.slice(0, SHOWN).map((item) => `- ${item}`);
      if (items.length > SHOWN) shown.push(`- and ${items.length - SHOWN} more`);
      blocked.push([`${where}, continuation ${result.blocks} of at most ${MAX_WINDOW} in ${WINDOW_MINUTES} minutes${result.last ? ', the last one this hook forces' : ''}:`, ...shown,
        ...(result.last ? [`If you cannot resolve them now, your reply must end with that question to the user; the next stop${result.window ? '' : ' with these same open items'} goes through.`] : [])].join('\n'));
    } catch (error) {
      notes.push(`check-plan-stop: ${where} could not be checked (${error?.message ?? error}), so its execution was let through.`);
    }
  }
  const message = notes.length > 0 ? { systemMessage: notes.join('\n') } : {};
  if (blocked.length === 0) return message;
  return {
    decision: 'block',
    reason: `The plan execution cannot end yet (${RULE}): it ends only with what the user authorized done, or with each item left put to the user as a question or accepted by the user.\n${blocked.join('\n')}\n`
      + 'Go on with each item within what the user authorized. For one the user did not authorize, such as a fragment beyond those the user asked to run, or one only the user can settle, '
      + 'ask the user through the question mechanism, with its options and the recommended one first, never assuming the answer, and only then mark its report line "[asked the user YYYY-MM-DD]", '
      + 'or "[accepted by the user YYYY-MM-DD]" once the user accepts it as it stands; a marked \u23f3 line that names fragments, or a range of them such as 02-04, covers them. A subagent, which cannot ask the user, hands that '
      + `question to its caller in its final message and marks the line as asked; the fragments outside the part delegated to it are not its own. ${TOKEN}`,
    ...message,
  };
}

try {
  const raw = await readHookInput();
  const root = enterRepositoryRoot();
  const output = root ? guard(raw && typeof raw === 'object' ? raw : {}, root) : {};
  if (Object.keys(output).length > 0) process.stdout.write(`${JSON.stringify(output)}\n`);
} catch (error) {
  if (!start) process.stdout.write(`${JSON.stringify({ systemMessage: `check-plan-stop: the plan execution could not be checked (${error?.message ?? error}), so the stop goes through.` })}\n`);
}
process.exit(0);
