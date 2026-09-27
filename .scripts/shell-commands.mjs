// Splits a command line into simple commands the way a POSIX shell, or with
// { powershell: true } PowerShell, reads it, for the hooks that inspect a
// command before it runs: at ;, &, |, parentheses, backquotes, $(, and line
// ends, with quotes removed and # comments dropped. Each here-document body is
// attached to the command that opens it; one inside a double-quoted $( ... ),
// such as a commit message, stays part of that quoted word. It recognizes
// words, not grammar: keywords such as if or do come back as ordinary words.

const SEPARATORS = new Set([';', '&', '|', '(', ')', '`']);
const HEREDOC = /^<<-?[ \t]*(['"]?)([^'"\s;&|<>()]+)\1/;

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

// Reads the quoted text that starts at index i and returns it with the index
// of its closing quote.
function readQuoted(script, i, powershell) {
  const quote = script[i];
  const pending = [];
  let text = '';
  let j = i + 1;
  while (j < script.length && script[j] !== quote) {
    if (quote === '"' && script[j] === '\n' && pending.length > 0) {
      const read = readBodies(script, j, pending.splice(0));
      text += `\n${read.bodies.join('\n')}`;
      j = read.end;
      continue;
    }
    if (quote === '"' && script.startsWith('<<', j)) {
      const match = HEREDOC.exec(script.slice(j, j + 256));
      if (match) pending.push(match[2]);
    }
    if (quote === '"' && !powershell && script[j] === '\\' && '"\\$`\n'.includes(script[j + 1] || ' ')) j++;
    text += script[j++] ?? '';
  }
  return { text, end: j };
}

export function commands(script, { powershell = false } = {}) {
  const found = [];
  let words = [];
  let word = null;
  let bodies = [];
  let delimiters = [];
  const endWord = () => {
    if (word !== null) words.push(word);
    word = null;
  };
  const endCommand = () => {
    endWord();
    if (words.length > 0) found.push({ words, bodies });
    words = [];
    bodies = [];
  };
  for (let i = 0; i < script.length; i++) {
    const c = script[i];
    if (c === '#' && word === null) {
      const next = script.indexOf('\n', i);
      i = (next === -1 ? script.length : next) - 1;
    } else if (c === '\\' && !powershell) {
      if (script[i + 1] !== '\n') word = (word ?? '') + (script[i + 1] ?? '');
      i++;
    } else if (powershell && c === '@' && /^['"]\r?\n/.test(script.slice(i + 1, i + 4))) {
      const close = script.indexOf(`\n${script[i + 1]}@`, i + 2);
      word = (word ?? '') + script.slice(i + 2, close === -1 ? undefined : close).trim();
      i = close === -1 ? script.length : close + 2;
    } else if (c === "'" || c === '"') {
      const read = readQuoted(script, i, powershell);
      word = (word ?? '') + read.text;
      i = read.end;
    } else if (script.startsWith('<<<', i)) {
      endWord();
      i += 2;
    } else if (c === '<' && script[i + 1] === '<' && !powershell) {
      endWord();
      const match = HEREDOC.exec(script.slice(i, i + 256));
      if (match) delimiters.push(match[2]);
      i += match ? match[0].length - 1 : 1;
    } else if (c === '\n') {
      const read = readBodies(script, i, delimiters);
      bodies.push(...read.bodies);
      i = read.end;
      delimiters = [];
      endCommand();
    } else if (SEPARATORS.has(c) || (c === '$' && script[i + 1] === '(')) {
      endCommand();
    } else if (c === ' ' || c === '\t' || c === '\r' || c === '<' || c === '>') {
      endWord();
    } else {
      word = (word ?? '') + c;
    }
  }
  endCommand();
  return found;
}
