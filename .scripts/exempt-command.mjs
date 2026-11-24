// Reads a shell call the way the client's sandbox exemption does, for the exempt-command hook
// (16-command-execution.md): which simple commands it holds and which forms keep it confined even when every
// command matches an exemption. Those forms are a redirection other than one that only duplicates a descriptor, as
// 2>&1 does, a pipe, chaining with && || ; & or a line end, a leading variable assignment, a cd, pushd or popd, a
// sudo, eval or xargs prefix, a command substitution, a subshell and a control block, whose keywords (if, then, do,
// {, !...) are removed from the start of a command (.readme/91-agent-sandbox.md, "Claude Code"), plus the two of
// exempt-shapes.mjs. Quoted text, escaped characters, comments and here-document bodies are not commands or operators.

import { expand, leavesTree, remember } from './exempt-shapes.mjs';
import { HEREDOC, readBodies } from './shell-spans.mjs';

const ENV = /^[A-Za-z_][A-Za-z0-9_]*=/;
const DIRECTORY = new Set(['cd', 'pushd', 'popd']);
const PREFIXES = new Set(['sudo', 'eval', 'xargs']);
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '{', '!']);
const FD_DUP = /^[&](?:\d+|-)/;

// { segments, forms }: each simple command as the exemption sees it, with its redirections, variable assignments and
// prefixes and control keywords removed and the cd calls left out, and the set of form names found.
export function splitCommand(text, { powershell = false } = {}) {
  const forms = new Set();
  const segments = [];
  const awaiting = new Set();
  const vars = new Map();
  const heredocs = [];
  let words = [];
  let word = null;
  let skip = false;
  const nest = (inner) => {
    const sub = splitCommand(inner, { powershell });
    segments.push(...sub.segments);
    sub.forms.forEach((form) => forms.add(form));
  };
  const endWord = () => {
    if (word !== null && skip) skip = false;
    else if (word !== null) {
      if (words.length === 0) {
        awaiting.forEach((form) => forms.add(form));
        awaiting.clear();
      }
      words.push(word);
    }
    word = null;
  };
  const endSegment = (kind) => {
    endWord();
    const rest = words;
    words = [];
    const strip = (drop, form) => {
      while (rest.length > 0 && drop(rest[0])) {
        forms.add(form);
        rest.shift();
      }
    };
    const assigned = [];
    strip((first) => KEYWORDS.has(first), 'block');
    strip((first) => ENV.test(first) && assigned.push(first), 'env');
    if (rest.length === 0 || rest[0] === 'export') remember(vars, rest.length === 0 ? assigned : rest);
    const evaluated = rest[0] === 'eval';
    strip((first) => PREFIXES.has(first), 'prefix');
    const named = expand(rest[0] ?? '', vars);
    if (named !== null) {
      rest[0] = named;
      forms.add('variable');
    }
    if (leavesTree(rest)) forms.add('path');
    if (DIRECTORY.has(rest[0])) forms.add('cd');
    else if (evaluated && rest.length === 1 && /^(["']).*\1$/s.test(rest[0])) nest(rest[0].slice(1, -1));
    else if (rest.length > 0) segments.push(rest.join(' '));
    if (kind) awaiting.add(kind);
  };
  const quoted = (i) => {
    const quote = text[i];
    let j = i + 1;
    for (; j < text.length && text[j] !== quote; j++) {
      if (quote === '"' && text[j] === (powershell ? '`' : '\\')) j++;
      else if (quote === '"' && text.startsWith('$(', j)) {
        let depth = 1, k = j + 2;
        for (; k < text.length && depth > 0; k++) depth += text[k] === '(' ? 1 : text[k] === ')' ? -1 : 0;
        forms.add('substitution');
        nest(text.slice(j + 2, k - 1));
        j = k - 1;
      } else if (quote === '"' && !powershell && text[j] === '`') {
        const end = text.indexOf('`', j + 1);
        forms.add('substitution');
        nest(text.slice(j + 1, end === -1 ? undefined : end));
        j = end === -1 ? text.length : end;
      }
    }
    word = (word ?? '') + text.slice(i, j + 1);
    return j;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '#' && word === null) i = (text.indexOf('\n', i) + 1 || text.length + 1) - 2;
    else if (c === (powershell ? '`' : '\\')) word = (word ?? '') + c + (next ?? ''), i++;
    else if (c === "'" || c === '"') i = quoted(i);
    else if (c === '<' && !powershell && next === '<') {
      endWord();
      forms.add('redirection');
      const match = text.startsWith('<<<', i) ? null : HEREDOC.exec(text.slice(i, i + 256));
      if (match) heredocs.push(match[2]);
      else skip = true;
      i += match ? match[0].length - 1 : text.startsWith('<<<', i) ? 2 : 1;
    } else if (c === '>' || c === '<' || (c === '&' && next === '>')) {
      const fd = word !== null && /^\d+$/.test(word) ? word : '';
      if (fd) word = null;
      endWord();
      let j = i + (c === '&' ? 1 : 0);
      while (text[j + 1] === '>' || text[j + 1] === '|') j++;
      if (c !== '&' && FD_DUP.test(text.slice(j + 1, j + 4))) {
        const dup = /^&(?:\d+|-)/.exec(text.slice(j + 1))[0];
        word = fd + text.slice(i, j + 1) + dup;
        j += dup.length;
        endWord();
      } else {
        forms.add('redirection');
        skip = true;
        if (text[j + 1] === '&') j++;
      }
      i = j;
    } else if (c === '\n' && heredocs.length > 0) {
      i = readBodies(text, i, heredocs.splice(0)).end;
      endSegment('chain');
    } else if ((c === '$' && next === '(') || (c === '`' && !powershell)) {
      forms.add('substitution');
      skip = false;
      endSegment();
      if (c === '$') i++;
    } else if (c === '(' || c === ')') {
      if (c === '(') {
        forms.add('subshell');
        skip = false;
      }
      endSegment();
    } else if (c === ';' || c === '\n' || (c === '&' && !powershell) || (c === '&' && next === '&')) {
      endSegment('chain');
      if (next === c && c === '&') i++;
    } else if (c === '|') {
      endSegment(next === '|' ? 'chain' : 'pipe');
      if (next === '|') i++;
    } else if (c === ' ' || c === '\t' || c === '\r') endWord();
    else word = (word ?? '') + c;
  }
  endSegment();
  return { segments, forms };
}
