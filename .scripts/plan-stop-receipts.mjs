// The receipts check-plan-stop.mjs keeps for the questions it saw put to the user, per plan in .cache/stop-guard/receipts.json,
// which a report line marked [answered YYYY-MM-DD P-01] needs before it stops counting as open (prompt-plan,
// references/execution.md, Ending an execution). One receipt per question ID: `presented` when a final message of a session
// showed the question, `answered` once a later user turn of that session started (never an automatic one, turn-marker.mjs) or
// the client's question tool returned an answer to a question that names the ID; asking it again presents it again. Written
// through plan-stop-state.mjs, so a symlink in .temp/ leads nowhere.

import { planFolders } from './plan-stop.mjs';
import { readState, writeState } from './plan-stop-state.mjs';

const FILE = 'receipts.json';
const NAMED = /\[(P-\d{2,})\](?:[ \t]+\[([^\]]+)\])?/g;
const object = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const read = (root, plan) => object(readState(root, plan, FILE));

export const answeredIds = (root, plan) => new Set(Object.entries(read(root, plan)).filter(([, receipt]) => receipt?.status === 'answered').map(([id]) => id));

// Stores `status` for the IDs.
function record(root, plan, ids, status, session) {
  const stored = read(root, plan);
  const next = { ...stored };
  for (const id of ids) next[id] = { status, session };
  if (JSON.stringify(next) !== JSON.stringify(stored)) writeState(root, plan, FILE, next);
}

// The questions of a final message of the session, as finalQuestions reads them, are presented.
export const present = (root, plan, questions, session) => record(root, plan, questions.map(({ id }) => id).filter(Boolean), 'presented', session);

// A user turn started: what the session presented in the plans of .temp/plans/ is answered.
export function answerPresented(root, session) {
  for (const plan of planFolders(root)) {
    try {
      const ids = Object.entries(read(root, plan)).filter(([, receipt]) => receipt?.status === 'presented' && receipt.session === session).map(([id]) => id);
      if (ids.length > 0) record(root, plan, ids, 'answered', session);
    } catch {}
  }
}

// Whether the client's answer holds one for the question: an entry of `answers` in the tool's input or response, or, when the
// response is text, the question followed by `="` and a non-empty answer.
function hasAnswer(input, question) {
  const response = input.tool_response;
  const given = { ...object(input.tool_input?.answers), ...object(object(response).answers) }[question];
  if (typeof given === 'string') return given.trim() !== '';
  if (Array.isArray(given)) return given.length > 0;
  return typeof response === 'string' && response.includes(`"${question}"="`) && !response.includes(`"${question}"=""`);
}

// After the client's question tool: each answered question that names `[P-01]` gives that ID an answered receipt in the plan
// it names after the ID, or in the only one of `plans`, those the turn touched, as the stop check counts them.
export function fromTool(root, input, session, plans) {
  const questions = Array.isArray(input.tool_input?.questions) ? input.tool_input.questions : [];
  for (const { question } of questions) {
    if (typeof question !== 'string' || !hasAnswer(input, question)) continue;
    for (const [, id, named] of question.matchAll(NAMED)) {
      for (const plan of named ? plans.filter((candidate) => candidate === named) : plans.length === 1 ? plans : []) record(root, plan, [id], 'answered', session);
    }
  }
}
