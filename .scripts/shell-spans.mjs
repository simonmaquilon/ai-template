// Reads the spans of a command line that the tokenizer in shell-commands.mjs
// treats as units: here-document bodies, quoted text with the command
// substitutions it runs, parenthesized substitutions, and PowerShell literal
// lists. Delimiters may be quoted or escaped with a backslash, as in <<'EOF' or
// <<\EOF.

export const HEREDOC = /^<<-?[ \t]*\\?(['"]?)([^'"\s;&|<>()\\]+)\1/;
const LITERAL_LIST = /^\s*(?:'[^']*'|"[^"$`]*")(?:\s*,\s*(?:'[^']*'|"[^"$`]*"))*\s*$/;
const LIST_START = /^\s*(?:'[^']*'|"[^"$`]*")(?:\s*,\s*(?:'[^']*'|"[^"$`]*"))*(?:\s*,?\s*(?:'[^']*|"[^"$`]*)?)$/;

// Reads the bodies of the here-documents that start after the newline at index
// i, and returns them with the index of the newline that ends the last one.
export function readBodies(script, i, delimiters) {
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
export function readQuoted(script, i, powershell) {
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

// The index of the parenthesis that closes a PowerShell @( ... ) opened at
// index i when it only lists quoted strings, or -1. The scan stops at LIMIT
// characters unless what it has read so far is still such a list.
export function literalListEnd(script, i) {
  const limit = Math.min(script.length, i + 4096);
  let end = closeParen(script, i + 2, true, limit);
  if (end === limit && limit < script.length && LIST_START.test(script.slice(i + 2, limit))) end = closeParen(script, i + 2, true);
  return end < script.length && LITERAL_LIST.test(script.slice(i + 2, end)) ? end : -1;
}
