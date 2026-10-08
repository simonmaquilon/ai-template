// Decides which command lines browser.mjs may hand to the Playwright CLI, which
// it runs outside the client sandbox: only commands and documented options that
// drive the page, http(s) or about:blank addresses, session names that stay a
// plain name, and files named by a relative path inside the repository that
// crosses no symbolic link. It reads the arguments as the CLI's own parser does:
// a first "--" ends the options, "--no-name" takes no value, and "--name value"
// takes the next argument unless the option is a flag or that argument starts
// with a dash.

import { lstatSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const FILE = ['filename'];
const OPTIONS = {
  open: ['browser', 'device', 'headed', 'idle-timeout', 'mobile', 'persistent'],
  close: [], goto: [], type: ['submit'], click: ['modifiers'], dblclick: ['modifiers'], fill: ['submit'], drag: [],
  hover: [], select: [], check: [], uncheck: [], snapshot: [...FILE, 'depth', 'boxes'], find: ['regex', ...FILE, 'max-results'],
  eval: FILE, 'dialog-accept': [], 'dialog-dismiss': [], resize: [], 'delete-data': [], 'go-back': [], 'go-forward': [],
  reload: [], press: [], keydown: [], keyup: [], mousemove: [], mousedown: [], mouseup: [], mousewheel: [],
  screenshot: [...FILE, 'type', 'full-page', 'hires'], pdf: FILE, 'tab-list': [], 'tab-new': ['isolated-context'],
  'tab-close': [], 'tab-select': [], 'state-load': [], 'state-save': [], 'cookie-list': ['domain', 'path'],
  'cookie-get': [], 'cookie-set': ['domain', 'path', 'expires', 'httpOnly', 'secure', 'sameSite'], 'cookie-delete': [],
  'cookie-clear': [], 'localstorage-list': [], 'localstorage-get': [], 'localstorage-set': [], 'localstorage-delete': [],
  'localstorage-clear': [], 'sessionstorage-list': [], 'sessionstorage-get': [], 'sessionstorage-set': [],
  'sessionstorage-delete': [], 'sessionstorage-clear': [], 'set-color-scheme': [], 'set-reduced-motion': [],
  'set-forced-colors': [], 'set-contrast': [], 'set-media': [], 'clear-color-scheme': [], 'clear-reduced-motion': [],
  'clear-forced-colors': [], 'clear-contrast': [], 'clear-media': [], requests: ['static', 'filter', 'clear'],
  request: FILE, 'request-headers': FILE, 'request-body': FILE, 'response-headers': FILE, 'response-body': FILE,
  route: ['status', 'body', 'content-type', 'header', 'remove-header'], 'route-list': [], unroute: [],
  'network-state-set': [], console: ['clear'], 'recording-start': [], 'recording-stop': [], 'tracing-start': [],
  'tracing-stop': [], 'video-start': ['size', 'fps', 'cursor'], 'video-stop': [], 'video-chapter': ['description', 'duration'],
  'video-show-actions': ['duration', 'position', 'cursor', 'point-style', 'highlight-style', 'title-style'],
  'video-hide-actions': [], 'generate-locator': [], highlight: ['hide', 'style'], list: ['all'],
};
const GLOBAL = ['session', 'raw', 'json', 'help', 'version'];
// Every option the CLI parses as a flag, which never takes the next argument, allowed here or not, so that
// both read the same command.
const FLAGS = new Set(['all', 'annotate', 'boxes', 'clear', 'cursor', 'dry-run', 'force', 'full-page', 'g', 'global',
  'headed', 'help', 'hide', 'hires', 'httpOnly', 'json', 'kill', 'list', 'mobile', 'no-shell', 'only-shell', 'persistent',
  'raw', 'secure', 'static', 'submit', 'version', 'with-deps']);
const FILE_ARGUMENTS = new Set(['state-load', 'state-save', 'video-start']);
const URL_ARGUMENTS = new Set(['open', 'goto', 'tab-new']);
const BROWSERS = new Set(['chrome', 'chromium', 'msedge', 'firefox', 'webkit']);

const takesNext = (name, next) =>
  next !== undefined && ((!/^(-|--)[^-]/.test(next) && !FLAGS.has(name)) || /^(true|false)$/.test(next));

function checkPath(value, root) {
  const parts = value.split(/[\\/]+/);
  if (value === '' || isAbsolute(value) || /^[a-zA-Z]:/.test(value) || value.startsWith('~') || parts.includes('..')) {
    throw new Error(`"${value}" is not a relative path inside the repository`);
  }
  for (const base of [root, join(root, '.temp', 'playwright-cli')]) {
    let path = base;
    for (const part of parts.filter((p) => p && p !== '.')) {
      path = join(path, part);
      if (lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`"${value}" crosses a symbolic link`);
    }
  }
}

function checkSession(value) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value ?? '')) throw new Error('a session name holds only letters, digits, "-" and "_"');
}

// Returns the command these arguments run, or throws an Error that says why the CLI must not run them
// outside the sandbox.
export function checkArgs(args, root) {
  const end = args.indexOf('--');
  const values = [];
  const options = [];
  let command;
  for (let i = 0; i < (end === -1 ? args.length : end); i++) {
    const arg = args[i];
    // In the CLI parser's order: "--name=value", then "--no-name", which takes nothing, then "--name".
    const inline = /^--([^=]+)=([\s\S]*)$/.exec(arg);
    const negated = /^--no-.+$/.test(arg);
    const long = /^--(.+)$/.exec(arg);
    if (inline) {
      options.push([inline[1], inline[2]]);
    } else if (negated) {
      options.push([arg.slice(2), undefined]);
    } else if (long) {
      options.push([long[1], takesNext(long[1], args[i + 1]) ? args[++i] : undefined]);
    } else if (/^-[A-Za-z]/.test(arg)) {
      if (arg === '-s') checkSession(takesNext('s', args[i + 1]) ? args[++i] : undefined);
      else if (arg.startsWith('-s=')) checkSession(arg.slice(3));
      else throw new Error(`option ${arg} is not allowed`);
    } else if (command === undefined) {
      command = arg;
      if (!Object.hasOwn(OPTIONS, command)) throw new Error(`"${command}" is not an allowed command`);
    } else {
      values.push(arg);
    }
  }
  if (end !== -1) {
    if (command === undefined) throw new Error('the command must come before "--"');
    values.push(...args.slice(end + 1));
  }
  if (command === undefined && !options.some(([name]) => name === 'help' || name === 'version')) {
    throw new Error('a command is required');
  }
  for (const [name, value] of options) {
    if (!GLOBAL.includes(name) && !OPTIONS[command]?.includes(name)) throw new Error(`--${name} is not allowed here`);
    if (name === 'session') checkSession(value);
    if (FILE.includes(name)) checkPath(value ?? '', root);
    if (name === 'browser' && !BROWSERS.has(value)) throw new Error(`--browser must be one of ${[...BROWSERS].join(', ')}`);
    if (FILE_ARGUMENTS.has(command) && value !== undefined) checkPath(value, root);
  }
  if (FILE_ARGUMENTS.has(command)) values.forEach((value) => checkPath(value, root));
  if (URL_ARGUMENTS.has(command)) {
    for (const value of values) {
      if (!/^https?:\/\//i.test(value) && value !== 'about:blank') throw new Error(`"${value}" is not an http(s) address`);
    }
  }
  return command;
}
