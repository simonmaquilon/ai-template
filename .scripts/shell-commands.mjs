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

const SEPARATORS = new Set([';', '&', '|', '(', ')', '`']);
const HEREDOC = /^<<-?[ \t]*(['"]?)([^'"\s;&|<>()]+)\1/;
const LITERAL_LIST = /^\s*(?:'[^']*'|"[^"$`]*")(?:\s*,\s*(?:'[^']*'|"[^"$`]*"))*\s*$/;

// Reads the bodies of the here-documents that start after the newline at index
// i, and returns them with the index of the newline that ends the last one.
function readBodies(script, i, delimiters) {
  const bodies = [];
  for (const delimiter of delimiters) {
    const lines = [];
    while (i < script.length) {
      const next = script.indexOf('\n', i + 1);
      const line = script.slice(i + 1, next === -1 ? undefined : next);
      i = next === -1 ? script.length : next;
      if (line.trim() === delimiter) break;
      lines.push(line);
    }
    bodies.push(lines.join('\n'));
  }
  return { bodies, end: i };
}

// Index of the parenthesis that closes a $( ... ) whose content starts at
// index i, skipping quoted text and here-document bodies.
function closeParen(script, i, powershell, limit = script.length) {
  const delimiters = [];
  for (let depth = 1; i < limit; i++) {
    const c = script[i];
    if (c === (powershell ? '`' : '\\')) i++;
    else if (c === "'" || c === '"') i = readQuoted(script, i, powershell).end;
    else if (c === '\n' && delimiters.length > 0) i = readBodies(script, i, delimiters.splice(0)).end;
    else if (c === '<' && script[i + 1] === '<') delimiters.push(...(HEREDOC.exec(script.slice(i, i + 256))?.slice(2, 3) ?? []));
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return limit;
}

// Reads the quoted text that starts at index i and returns it with the index
// of its closing quote and the command substitutions it runs.
function readQuoted(script, i, powershell) {
  const quote = script[i];
  const scripts = [];
  let text = '';
  let j = i + 1;
  while (j < script.length && script[j] !== quote) {
    const substitution = quote === '"' && (script.startsWith('$(', j) || (!powershell && script[j] === '`'));
    if (substitution) {
      const end = script[j] === '`' ? script.indexOf('`', j + 1) : closeParen(script, j + 2, powershell);
      const stop = end === -1 ? script.length : end;
      scripts.push(script.slice(j + (script[j] === '`' ? 1 : 2), stop));
      text += script.slice(j, stop + 1);
      j = stop + 1;
      continue;
    }
    if (quote === '"' && !powershell && script[j] === '\\' && '"\\$`\n'.includes(script[j + 1] || ' ')) j++;
    else if (quote === '"' && powershell && script[j] === '`') j++;
    text += script[j++] ?? '';
  }
  return { text, end: j, scripts };
}

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
      if (match) delimiters.push(match[2]);
      i += match ? match[0].length - 1 : 1;
    } else if (c === '\n') {
      const read = readBodies(script, i, delimiters);
      bodies.push(...read.bodies);
      i = read.end;
      delimiters = [];
      endCommand();
    } else if (powershell && script.startsWith('@(', i) && LITERAL_LIST.test(script.slice(i + 2, closeParen(script, i + 2, true, Math.min(script.length, i + 4096))))) {
      const end = closeParen(script, i + 2, true);
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
