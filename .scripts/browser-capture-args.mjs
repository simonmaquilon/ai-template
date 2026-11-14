// Reads and validates the command line of `capture`, merges it with the values the project declares, and returns the plan
// of the run. It throws an Error saying what is invalid before anything runs. Arguments beat the project's values, and a
// value neither gives is left out of the plan, never replaced by a default.

import { FOCUS, MAX_COMBINATIONS, MAX_LIST, TARGET, integer, readValues, scheme, viewport } from './browser-capture-values.mjs';

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const URL = /^(https?:\/\/[^\s\x00-\x1f\x7f-\x9f\u200e\u200f\u202a-\u202e\u2066-\u2069]{1,2040}|about:blank)$/i;
const SINGLE = ['name', 'min-target', 'focus-steps'];
const REPEATED = ['viewport', 'scheme'];
const FILE = '.playwright/capture.config.json';

// `capture` is the command, after at most the session option as -s=<name> or -s <name>.
export const isCapture = (args) => args[args[0] === '-s' ? 2 : args[0]?.startsWith('-s=') ? 1 : 0] === 'capture';

function readArgs(args) {
  let at = 0;
  let session;
  if (args[0] === '-s') [session, at] = [args[1], 2];
  else if (args[0].startsWith('-s=')) [session, at] = [args[0].slice(3), 1];
  if (session !== undefined && !ID.test(session)) throw new Error('a session name holds only letters, digits, "-" and "_"');
  const given = { urls: [], viewport: [], scheme: [] };
  for (at += 1; at < args.length; at++) {
    const match = /^--([a-z-]+)(?:=([\s\S]*))?$/.exec(args[at]);
    if (!match) {
      if (args[at].startsWith('-')) throw new Error(`option ${args[at]} is not allowed`);
      given.urls.push(args[at]);
      continue;
    }
    const [, option, inline] = match;
    if (![...SINGLE, ...REPEATED].includes(option)) throw new Error(`--${option} is not an option of capture`);
    const value = inline ?? args[++at];
    if (value === undefined) throw new Error(`--${option} needs a value`);
    if (REPEATED.includes(option)) given[option].push(value);
    else if (given[option] !== undefined) throw new Error(`--${option} is given once`);
    else given[option] = value;
  }
  return { session, given };
}

function each(values, check) {
  return values.map((value) => {
    try {
      return check(value);
    } catch (error) {
      throw new Error(`"${value.slice(0, 40)}" is invalid: ${error.message}`);
    }
  });
}

const unique = (items, key = (item) => item) => [...new Map(items.map((item) => [key(item), item])).values()];

export function planCapture(args, root) {
  const { session, given } = readArgs(args);
  const { name, urls } = given;
  if (!ID.test(name ?? '')) throw new Error('--name is required and holds only letters, digits, "-" and "_", up to 64');
  if (urls.length === 0) throw new Error('capture needs at least one URL');
  for (const url of urls) {
    if (!URL.test(url)) throw new Error(`"${url.slice(0, 80)}" is not an http(s) address or about:blank`);
  }
  for (const option of REPEATED) {
    if (given[option].length > MAX_LIST) throw new Error(`at most ${MAX_LIST} --${option} values`);
  }
  const values = readValues(root);
  // What the arguments give wins over what the project declares; a source of undefined means neither gave it.
  const choose = (key, given, check) => (given.length > 0 ? [each(given, check), 'arguments'] : [values[key] ?? [], values[key] && FILE]);
  const [viewports, viewportsFrom] = choose('viewports', given.viewport, viewport);
  const [schemes, schemesFrom] = choose('schemes', given.scheme, scheme);
  const minTarget = given['min-target'] === undefined ? values.minTarget : integer(given['min-target'], TARGET, '--min-target');
  const plan = {
    session, name, urls: unique(urls), viewports: unique(viewports, (size) => size.label), schemes: unique(schemes), minTarget,
    focusSteps: given['focus-steps'] === undefined ? undefined : integer(given['focus-steps'], FOCUS, '--focus-steps'),
    from: { viewports: viewportsFrom, schemes: schemesFrom, minTarget: given['min-target'] === undefined ? values.minTarget && FILE : 'arguments' },
  };
  const combinations = plan.urls.length * Math.max(1, plan.viewports.length) * Math.max(1, plan.schemes.length);
  if (combinations > MAX_COMBINATIONS) throw new Error(`${combinations} combinations of URL, size and color scheme exceed the limit of ${MAX_COMBINATIONS}`);
  return plan;
}
