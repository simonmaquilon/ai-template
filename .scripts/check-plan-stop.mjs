#!/usr/bin/env node
// Keeps an execution of a prompt-plan plan from ending while it can still go on within what the user authorized
// (prompt-plan, references/execution.md, Ending an execution). A matching final question or subagent handoff can pause
// open work. With --turn-start, on UserPromptSubmit, it writes a marker for the
// session's turn under .temp/, unless the prompt carries TOKEN or the continuation token of check-file-length.mjs, as
// the continuation either hook causes does (turn-marker.mjs); with --agent-start, on SubagentStart, one for the
// subagent. On Stop and SubagentStop it checks the plans under .temp/plans/ that the turn, or the
// subagent since it started, wrote, as plan-stop.mjs reads them (a subagent answers only for the fragments it opened,
// never for the report's lines), and blocks the stop with decision "block" and the open
// items as the reason, which both clients hand to the agent as its next instruction. Without a turn marker it checks
// only a plan whose times.log has a work segment open; a subagent without a marker, such as one of the client's
// own, is never checked, nor a stop while a background subagent, workflow, or teammate runs. plan-stop-state.mjs
// bounds the blocks and lets the stop through, with a warning to the user, at its limits or when it cannot keep its
// count; it never relies on stop_hook_active. Its own errors never block: it exits 0 with a warning.

import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enterRepositoryRoot, readHookInput } from './hook-support.mjs';
import { PLANS, hasCurrentEvidence, lastTime, openItems, opensWork, planFolders, started, touchedSince } from './plan-stop.mjs';
import { finalQuestions } from './plan-stop-questions.mjs';
import { MAX_WINDOW, WINDOW_MINUTES, count, dropState, readState, writeState } from './plan-stop-state.mjs';
import { PLAN_STOP_TOKEN as TOKEN, isContinuation, markTurnStart } from './turn-marker.mjs';

const MARKERS = '.temp/check-plan-stop';
const SHOWN = 25;
const RULE = 'prompt-plan, references/execution.md, Ending an execution';
const PROVENANCE = 'Approval provenance is unavailable for this client. Open items stay pending, including ones with report marks.';
const BACKGROUND = new Set(['subagent', 'workflow', 'teammate']);
const start = process.argv.includes('--turn-start') ? 'turn' : process.argv.includes('--agent-start') ? 'agent' : null;
const id = (value) => String(value ?? '').replace(/[^\w-]/g, '_');

async function statusChecker() {
  const source = new URL('../.agents/skills/prompt-plan/scripts/node/check-report.mjs', import.meta.url);
  try {
    if (lstatSync(source, { throwIfNoEntry: false })?.isFile() && realpathSync.native(source) === fileURLToPath(source)) {
      const { checkStatus } = await import(source.href);
      if (typeof checkStatus === 'function') return checkStatus;
    }
  } catch {}
  return null;
}

function guard(input, root, checkStatus) {
  const session = id(input.session_id);
  const subagent = start === 'agent' || input.hook_event_name === 'SubagentStop';
  const marker = session && (!subagent ? session : id(input.agent_id) && `${session}--${id(input.agent_id)}`);
  const actor = `${subagent ? 'agent' : 'session'}-${marker || 'none'}.json`;
  const markers = join(root, ...MARKERS.split('/'));
  const time = (name) => lstatSync(join(markers, name), { throwIfNoEntry: false })?.mtimeMs ?? null;
  // A marker's identity is the time it holds, which stays the same if anything moves its modification time.
  const identity = () => (time(marker) === null ? null : `marker ${readFileSync(join(markers, marker), 'latin1').slice(0, 20)}`);

  if (start === 'turn' && marker && !isContinuation(input.prompt)) markTurnStart(root, MARKERS, marker);
  if (start === 'agent' && marker) markTurnStart(root, MARKERS, marker);
  if (start) return {};

  const from = marker ? time(marker) : null;
  if (subagent && from === null) return {};
  if (!subagent && Array.isArray(input.background_tasks) && input.background_tasks.some((task) => BACKGROUND.has(task?.type))) return {};
  // A subagent answers for the before records written after its marker and before the next subagent's of its session.
  const until = subagent ? Math.min(Infinity, ...readdirSync(markers).filter((name) => name.startsWith(`${session}--`) && name !== marker)
    .map(time).filter((other) => other !== null && other > from)) : Infinity;
  const [blocked, notes] = [[], []];
  const eligible = [];
  for (const plan of planFolders(root)) {
    try {
      if (!started(root, plan)) continue;
      const turn = from === null ? `open ${lastTime(root, plan)}` : identity();
      const stored = readState(root, plan, actor);
      const prior = stored?.turn === turn ? stored : null;
      if (prior?.released) continue;
      if (!(from === null ? opensWork(lastTime(root, plan)) : touchedSince(root, plan, from) || prior?.fingerprint)) continue;
      eligible.push({ plan, turn, stored });
    } catch (error) {
      notes.push(`check-plan-stop: ${PLANS}/${plan} could not be checked (${error?.message ?? error}), so its execution was let through.`);
    }
  }
  const questions = finalQuestions(input, subagent);
  for (const { plan, turn, stored } of eligible) {
    const where = `${PLANS}/${plan}`;
    try {
      const matching = questions.filter((question) => question.plan ? question.plan === plan : eligible.length === 1);
      const { items, unreadable } = openItems(root, plan, subagent ? { since: from, until } : null, matching);
      if (unreadable) {
        notes.push(`check-plan-stop: ${where}: could not read ${unreadable.join(' and ')}, so its execution was not checked.`);
        continue;
      }
      if (input.hook_event_name === 'Stop') {
        const evidence = checkStatus?.(root, join(root, where));
        if (evidence?.active) items.push(...evidence.diagnostics);
        if (!checkStatus && hasCurrentEvidence(root, plan)) items.push('Could not load the checked-in evidence evaluator for this plan.');
      }
      if (items.length === 0) {
        if (subagent || !stored?.times?.length) dropState(root, plan, actor);
        else writeState(root, plan, actor, { turn, times: stored.times });
        continue;
      }
      const result = count(root, plan, actor, stored, turn, items);
      if (result.verdict === 'release') {
        if (subagent) dropState(root, plan, actor);
        const brake = result.lost ? 'the hook could not keep its count in the plan’s .cache/' : 'the continuation limit was reached';
        notes.push(`check-plan-stop (${RULE}): ${where} still has ${items.length} open ${items.length === 1 ? 'item' : 'items'}. The turn may end because ${brake}: ${items.slice(0, 5).join('; ')}. ${PROVENANCE}`);
        continue;
      }
      const shown = items.slice(0, SHOWN).map((item) => `- ${item}`);
      if (items.length > SHOWN) shown.push(`- and ${items.length - SHOWN} more`);
      blocked.push([`${where}, continuation ${result.blocks} of at most ${MAX_WINDOW} in ${WINDOW_MINUTES} minutes${result.last ? ', the last one this hook forces' : ''}:`, ...shown,
        ...(result.last ? [`The next stop${result.window ? '' : ' with these same open items'} goes through with an open-items warning.`] : [])].join('\n'));
    } catch (error) {
      notes.push(`check-plan-stop: ${where} could not be checked (${error?.message ?? error}), so its execution was let through.`);
    }
  }
  const message = notes.length > 0 ? { systemMessage: notes.join('\n') } : {};
  if (blocked.length === 0) return message;
  const scope = eligible.length > 1 ? ' Add [plan-folder-name] after each item identifier or fragment number when multiple plans are in scope.' : '';
  const next = subagent
    ? 'Hand each unresolved decision to the coordinator in your final message with "- Handoff [P-01] Should …?" or "- Handoff fragment 02 Should …?".'
    : 'Give each open report line a unique [P-01]-style identifier after its status or [partial] marker. For a decision only the user can settle, ask a specific question on its own final-message line as "- [P-01] Should …?" with the options and the recommended one first. Name any related fragment numbers on its ⏳ report line.';
  return {
    decision: 'block',
    reason: `The plan execution has open items (${RULE}).\n${blocked.join('\n')}\n${PROVENANCE} `
      + `Go on with each item within what the user authorized. ${next}${scope} ${TOKEN}`,
    ...message,
  };
}

try {
  const raw = await readHookInput();
  const root = enterRepositoryRoot();
  const checker = root && !start && raw?.hook_event_name === 'Stop' ? await statusChecker() : null;
  const output = root ? guard(raw && typeof raw === 'object' ? raw : {}, root, checker) : {};
  if (Object.keys(output).length > 0) process.stdout.write(`${JSON.stringify(output)}\n`);
} catch (error) {
  if (!start) process.stdout.write(`${JSON.stringify({ systemMessage: `check-plan-stop: the plan execution could not be checked (${error?.message ?? error}), so the stop goes through.` })}\n`);
}
process.exit(0);
