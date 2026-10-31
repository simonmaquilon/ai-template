// Splits a command line into simple commands the way a POSIX shell, or with
// { powershell: true } PowerShell, reads it, for hooks that inspect a command
// before it runs: at ;, &, |, parentheses, $(, PowerShell's @(, line ends, and,
// outside PowerShell, where it escapes the next character, backquotes, with
// quotes removed and # comments dropped. A PowerShell @( ... ) that only lists
// quoted strings yields them as words. A substitution inside double quotes,
// $( ... ) or, outside PowerShell, backquoted, runs, so its commands are
// returned too. A here-document body goes with the command that opens it; a
// command fed by a pipe, a here-document, a here-string, or < is marked fed,
// and redirection targets are not words. An escaped line end, CRLF included,
// continues the line. Keywords such as if or do come back as ordinary words.

import { HEREDOC, literalListEnd, readBodies, readQuoted } from './shell-spans.mjs';

const SEPARATORS = new Set([';', '&', '|', '(', ')', '`']);
export function commands(script, { powershell = false } = {}) {
  const found = [];
  const nested = [];
  let words = [];
  let word = null;
  let bodies = [];
  let delimiters = [];
  let fed = false;
  let target = false;
  const endWord = () => {
    if (word !== null && !target) words.push(word);
    if (word !== null) target = false;
    word = null;
  };
  const endCommand = (piped = false) => {
    endWord();
    const empty = words.length === 0;
    if (!empty) found.push({ words, bodies, fed });
    words = [];
    bodies = [];
    fed = piped || (empty && fed);
    target = false;
  };
  for (let i = 0; i < script.length; i++) {
    const c = script[i];
    if (c === '#' && word === null) {
      const next = script.indexOf('\n', i);
      i = (next === -1 ? script.length : next) - 1;
    } else if (c === (powershell ? '`' : '\\')) {
      if (script.startsWith('\r\n', i + 1)) i++;
      else if (script[i + 1] !== '\n') word = (word ?? '') + (script[i + 1] ?? '');
      i++;
    } else if (powershell && c === '@' && /^['"]\r?\n/.test(script.slice(i + 1, i + 4))) {
      const close = script.indexOf(`\n${script[i + 1]}@`, i + 2);
      word = (word ?? '') + script.slice(i + 2, close === -1 ? undefined : close).trim();
      i = close === -1 ? script.length : close + 2;
    } else if (c === "'" || c === '"') {
      const read = readQuoted(script, i, powershell);
      word = (word ?? '') + read.text;
      nested.push(...read.scripts);
      i = read.end;
    } else if (script.startsWith('<<<', i)) {
      endWord();
      fed = target = true;
      i += 2;
    } else if (c === '<' && script[i + 1] === '<') {
      endWord();
      fed = true;
      const match = HEREDOC.exec(script.slice(i, i + 256));
      if (match) delimiters.push({ name: match[2], opener: bodies });
      i += match ? match[0].length - 1 : 1;
    } else if (c === '\n') {
      // A body feeds the command that opens it, even when the line goes on, and
      // also the line's last command, which a pipe may hand it to.
      const read = readBodies(script, i, delimiters.map(({ name }) => name));
      read.bodies.forEach((body, k) => new Set([delimiters[k].opener, bodies]).forEach((target) => target.push(body)));
      i = read.end;
      delimiters = [];
      endCommand();
    } else if (powershell && script.startsWith('@(', i) && literalListEnd(script, i) !== -1) {
      const end = literalListEnd(script, i);
      endWord();
      words.push(...[...script.slice(i + 2, end).matchAll(/'([^']*)'|"([^"]*)"/g)].map((match) => match[1] ?? match[2]));
      i = end;
    } else if (SEPARATORS.has(c) || ((c === '$' || (powershell && c === '@')) && script[i + 1] === '(')) {
      endCommand(c === '|' && script[i + 1] !== '|' && script[i - 1] !== '|');
    } else if (c === ' ' || c === '\t' || c === '\r' || c === '<' || c === '>' || (powershell && c === '*' && script[i + 1] === '>')) {
      endWord();
      if (c === '<' || c === '>') target = true;
      if (c === '<') fed = true;
    } else {
      word = (word ?? '') + c;
    }
  }
  endCommand();
  for (const inner of nested) found.push(...commands(inner, { powershell }));
  return found;
}
