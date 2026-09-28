// Decides whether a command names a staged path, for the effect hook of
// 27-version-control.md: brace expansion of path-like words, and matching a
// word against a repository-relative path from candidate directories.

import { isAbsolute, relative, resolve } from 'node:path';
import { toPosix } from './hook-support.mjs';

// Brace expansions of a path-like word, such as a/{b,c} into a/b and a/c, up
// to 64 of them; a word with spaces or quotes is not a path and stays whole.
export function braces(word) {
  const expanded = [word];
  for (let i = 0; i < expanded.length && expanded.length < 64 && !/[\s'"]/.test(word); i++) {
    const match = /^(.*?)\{([^{}]*,[^{}]*)\}(.*)$/s.exec(expanded[i]);
    if (match) expanded.splice(i--, 1, ...match[2].split(',').map((part) => `${match[1]}${part}${match[3]}`));
  }
  return expanded;
}

// A test of whether a repository-relative path is named by one of words,
// each resolved from one of dirs: by the path, a parent directory, or a git
// pathspec pattern, where * and ? also match / and :/ starts at the root; a
// pattern needs a literal character to name anything. A relative word, without
// its leading ./ or ../ parts, also names a path that ends with it, literally
// or as a pattern, brackets included, since Codex does not pass the hook the
// working directory a command sets. Words are indexed once, so each path costs
// a few lookups whatever the number of words.
export function namer(words, dirs, root) {
  const exact = new Set();
  const suffixes = new Set();
  const patterns = new Map();
  for (const word of new Set(words)) {
    const spec = word.replace(/^--pathspec-from-file=/, '');
    const plain = toPosix(spec).replace(/^(?:\.\.?\/)+/, '').replace(/\/$/, '');
    if (plain && !/^\.\.?(?:\/|$)/.test(plain) && !plain.startsWith(':') && !isAbsolute(plain)) {
      suffixes.add(plain);
      addPattern(patterns, plain, '(?:.*/)?');
    }
    for (const dir of dirs) {
      const target = toPosix(spec.startsWith(':/') ? spec.slice(2) : relative(root, resolve(dir, spec))).replace(/\/$/, '');
      if (!target || target.startsWith('..') || isAbsolute(target)) continue;
      exact.add(target);
      addPattern(patterns, target, '');
    }
  }
  return (path) => {
    const parts = path.split('/');
    for (let end = 1; end <= parts.length; end++) {
      if (exact.has(parts.slice(0, end).join('/'))) return true;
      for (let start = 0; start < end; start++) if (suffixes.has(parts.slice(start, end).join('/'))) return true;
    }
    return [...patterns.values()].some((pattern) => pattern.test(path));
  };
}

// Compiles a git pathspec pattern, after prefix, to match whole paths; a word
// without a wildcard or without a literal character is no pattern.
function addPattern(patterns, pattern, prefix) {
  if (!/[*?[]/.test(pattern) || !/[^*?/[\]]/.test(pattern) || patterns.has(prefix + pattern)) return;
  const escaped = pattern.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*\*\//g, '\0').replace(/\*+/g, '.*').replace(/\?/g, '.');
  try {
    patterns.set(prefix + pattern, new RegExp(`^${prefix}${escaped.replace(/\0/g, '(?:.*/)?')}$`));
  } catch {}
}
