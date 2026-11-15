// Finds the evident writes of a shell command into the paths a project protects, for the protected-paths hook
// (AGENTS.md). protectedPaths reads the list from the text of .claude/settings.json: the Edit(...) rules of
// permissions.deny, which Claude Code applies to every file tool, since it matches no Write(...) rule, and the entries
// of sandbox.filesystem.denyWrite, both read relative to the project root, a file or a folder with its contents;
// absolute, home, and wildcard rules it cannot read as one path are left out. shellWrites
// then judges a command as staging-reader.mjs walks it, so what a nested shell runs counts: the targets of > and >>,
// and what rm, mv, tee, touch, mkdir, chmod, truncate, cp and its kin (as destination), sed or perl -i, git checkout,
// restore, rm, mv and clean, and the PowerShell cmdlets that write take. A word counts when it leads to a protected
// path from the folder the command runs in, followed through an initial cd and the links that exist; $PWD and
// $CLAUDE_PROJECT_DIR at its start stand for that folder and the root, and a glob or another variable counts through
// the folder written before it. Reading a protected path, naming a parent folder of one, and what a program writes by
// itself are not seen. It reads only the command's text.

import { isAbsolute, join, posix, resolve, sep } from 'node:path';
import { GIT, gitSubcommand, walk } from './staging-reader.mjs';
import { realTarget } from './write-scope.mjs';
import { fromGitBash } from './write-scope-shell.mjs';

const RULE = /^Edit\((.+)\)$/;
const PWD = /^\$(?:\{pwd\}|pwd)(?=[\\/]|$)/i;
const PROJECT = /^\$(?:env:)?(?:\{CLAUDE_PROJECT_DIR\}|CLAUDE_PROJECT_DIR)(?=[\\/]|$)/i;
const UNREADABLE = /^(?:\/\/|~|[A-Za-z]:)|[*?[\]{}$]/;
const CD = /^(?:cd|chdir|pushd|set-location|push-location|sl)$/;
const ALL = new Set(['rm', 'unlink', 'rmdir', 'shred', 'mv', 'touch', 'mkdir', 'truncate', 'chmod', 'chown', 'chgrp', 'tee', 'tee-object',
  'remove-item', 'ri', 'del', 'erase', 'rd', 'move-item', 'mi', 'move', 'set-content', 'sc', 'add-content', 'ac', 'out-file',
  'clear-content', 'clc', 'new-item', 'ni', 'rename-item', 'rni', 'ren']);
const LAST = new Set(['cp', 'copy', 'copy-item', 'cpi', 'install', 'ln']);
const IN_PLACE = new Set(['sed', 'gsed', 'perl']);
const GIT_WRITES = new Set(['checkout', 'restore', 'rm', 'mv', 'clean']);
const fold = process.platform === 'linux' ? (path) => path : (path) => path.toLowerCase();

// One path relative to the root from a rule's text, or null. An Edit rule counts a leading / from the root; in the
// sandbox it is an absolute path. Claude Code also matches a bare Edit rule below the current folder, and a deny rule of
// one folder name at any depth; only the root's own path is read here.
function relativeTo(spec, rooted) {
  if (typeof spec !== 'string' || UNREADABLE.test(spec.replace(/\/\*\*$/, '')) || (!rooted && spec.startsWith('/'))) return null;
  const path = posix.normalize(spec.replaceAll('\\', '/').replace(/^\.?\//, '').replace(/\/(?:\*\*)?$/, ''));
  return path === '.' || path.startsWith('..') ? null : path;
}

// The protected paths a settings file lists, relative to the project root with forward slashes. Throws when the text
// is not JSON.
export function protectedPaths(text) {
  const { permissions, sandbox } = JSON.parse(text) ?? {};
  const edits = (Array.isArray(permissions?.deny) ? permissions.deny : []).map((rule) => relativeTo(RULE.exec(rule)?.[1], true));
  const writes = (Array.isArray(sandbox?.filesystem?.denyWrite) ? sandbox.filesystem.denyWrite : []).map((spec) => relativeTo(spec, false));
  return [...new Set([...edits, ...writes].filter(Boolean))];
}

// The non-option arguments, those after -- included.
function operands(args) {
  const end = args.indexOf('--');
  return [...(end === -1 ? args : args.slice(0, end)).filter((arg) => !arg.startsWith('-')), ...(end === -1 ? [] : args.slice(end + 1))];
}

// Where cp and its kin put their files: the -t, --target-directory, or -Destination value, else the last operand.
function destination(args) {
  const at = args.findIndex((arg) => /^(?:-t|--target-directory)$/.test(arg) || /^-dest(?:ination)?$/i.test(arg));
  const inline = args.find((arg) => arg.startsWith('--target-directory='));
  return [inline?.slice(19) ?? (at === -1 ? operands(args).at(-1) : args[at + 1])];
}

// What git checkout, restore, rm, mv, or clean names, and the folder -C moves to, as { dir, words }. It names nothing
// that leaves the work tree alone: restore --staged, rm --cached, and a dry run. folder(path, from) is the folder a
// path names from another, or null.
function gitWrites(args, dir, folder) {
  const { index, options } = gitSubcommand(args);
  const [sub, rest] = [args[index], args.slice(index + 1)];
  const has = (long, short) => rest.some((arg) => arg === `--${long}` || (short && new RegExp(`^-[A-Za-z]*${short}`).test(arg)));
  const idle = (sub === 'restore' && has('staged', 'S') && !has('worktree', 'W')) || (sub === 'rm' && has('cached'))
    || (['clean', 'rm', 'mv'].includes(sub) && has('dry-run', 'n'));
  const moved = options.filter(([name]) => name === '-C').reduce((base, [, path]) => folder(path, base), dir);
  return { dir: moved, words: GIT_WRITES.has(sub) && !idle ? operands(rest) : [] };
}

// The words a command takes as files it writes, besides its redirection targets.
function written(name, args) {
  const base = name.replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase();
  if (ALL.has(base)) return operands(args);
  if (LAST.has(base)) return destination(args);
  const inPlace = args.some((arg) => /^-[A-Za-z]*i/.test(arg) || arg === '--in-place' || arg.startsWith('--in-place='));
  return IN_PLACE.has(base) && inPlace ? operands(args) : [];
}

// The first protected path a command writes, as listed, or null. `readings` lists the PowerShell readings to try, true
// for PowerShell; gitBash says that Git Bash on Windows runs the POSIX readings. Throws when it nests too deep to read.
export function shellWrites(command, { readings, cwd, root, paths, gitBash = false }) {
  const real = (path) => { try { return realTarget(path); } catch { return resolve(path); } };
  const places = paths.map((path) => [path, fold(real(join(root, path)))]);
  let found = null;
  let dir = cwd;
  // The folder a word leads to, or null when it is relative to a folder not known, or only known up to a glob or variable.
  const locate = (word, powershell, from) => {
    if (typeof word !== 'string' || word.startsWith('~')) return null;
    const text = powershell ? word.replaceAll('\\', '/') : word;
    const anchor = PWD.test(text) ? [PWD, from] : PROJECT.test(text) ? [PROJECT, root] : null;
    if (anchor && !anchor[1]) return null;
    let rest = anchor ? text.replace(anchor[0], '') : text;
    const wild = rest.search(/[*?[{$`]/);
    if (wild !== -1) rest = rest.slice(0, rest.lastIndexOf('/', wild) + 1);
    const path = anchor ? anchor[1] + rest : gitBash && !powershell ? fromGitBash(rest) : rest;
    return path && (isAbsolute(path) ? path : from && join(from, path));
  };
  // The folder a word names as written, or null when a glob or variable leaves it open or the folder it starts from is unknown.
  const folder = (word, powershell, from) => {
    const found = /[*?[{$`]/.test(word) ? null : locate(word, powershell, from);
    return found ? resolve(found) : null;
  };
  const inside = (path, place) => path === place || path.startsWith(place + sep);
  const visit = ({ name, args, targets = [], powershell }) => {
    let from = dir;
    let words = written(name, args);
    if (CD.test(name.toLowerCase())) {
      dir = folder(operands(args)[0] ?? '', powershell, dir);
    } else if (GIT.test(name)) {
      ({ dir: from, words } = gitWrites(args, dir, (path, base) => folder(path, powershell, base)));
    }
    for (const word of [...targets, ...words]) {
      const path = locate(word, powershell, from);
      const hit = path ? places.find(([, place]) => inside(fold(real(path)), place)) : null;
      found ??= hit?.[0] ?? null;
    }
    return found !== null;
  };
  if (Array.isArray(command)) walk(command, { cwd, visit });
  else readings.some((powershell) => walk(String(command ?? ''), { powershell, cwd, visit }));
  return found;
}
