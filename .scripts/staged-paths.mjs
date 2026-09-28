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

// Whether a repository-relative path is named by a word resolved from one of
// dirs, with git pathspec patterns, where * and ? also match / and :/ starts at
// the root; a pattern needs a literal character to name anything. A relative
// word, without its leading ./ or ../ parts, also names a path that ends with
// it, literally or as a pattern, brackets included, since Codex does not pass
// the hook the working directory a command sets.
export function named(path, word, dirs, root) {
  const spec = word.replace(/^--pathspec-from-file=/, '');
  const plain = toPosix(spec).replace(/^(?:\.\.?\/)+/, '').replace(/\/$/, '');
  if (plain && !/^\.\.?(?:\/|$)/.test(plain) && !plain.startsWith(':') && !isAbsolute(plain)) {
    if (path === plain || path.startsWith(`${plain}/`) || path.endsWith(`/${plain}`) || path.includes(`/${plain}/`)) return true;
    if (matches(path, plain, '(?:.*/)?')) return true;
  }
  return dirs.some((dir) => {
    const target = toPosix(spec.startsWith(':/') ? spec.slice(2) : relative(root, resolve(dir, spec))).replace(/\/$/, '');
    if (!target || target.startsWith('..') || isAbsolute(target)) return false;
    return path === target || path.startsWith(`${target}/`) || matches(path, target, '');
  });
}

// Whether a git pathspec pattern, after prefix, matches the whole path; a word
// without a wildcard or without a literal character is no pattern.
function matches(path, pattern, prefix) {
  if (!/[*?[]/.test(pattern) || !/[^*?/[\]]/.test(pattern)) return false;
  const escaped = pattern.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*\*\//g, '\0').replace(/\*+/g, '.*').replace(/\?/g, '.');
  try {
    return new RegExp(`^${prefix}${escaped.replace(/\0/g, '(?:.*/)?')}$`).test(path);
  } catch {
    return false;
  }
}
