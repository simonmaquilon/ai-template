// Finds the evident writes of a shell command into a system temporary folder, for the write-scope hook
// (03-code-authoring.md): the targets of > and >>, the files tee or Tee-Object writes, and what mktemp or
// New-TemporaryFile creates, read with shell-commands.mjs. A target counts when it starts with a temporary-folder
// variable ($TMPDIR, $TMP, $TEMP, their ${...}, $env: and %...% forms) or when, written without variables, isTemp
// judges it in one. With gitBash, a word of a POSIX reading is first read as Git Bash runs it on Windows. It reads
// only the command's text, not the scripts or programs it runs; the sandbox confines the rest.

import { tmpdir } from 'node:os';
import { isAbsolute, posix, sep } from 'node:path';
import { commands } from './shell-commands.mjs';

const TEMP_VARIABLE = /^(?:\$\{?(?:TMPDIR|TMP|TEMP)\}?|\$env:(?:TMPDIR|TMP|TEMP)|%(?:TMPDIR|TMP|TEMP)%)(?:[\\/]|$)/i;
const ASSIGNMENT = /^[A-Za-z_]\w*=/;
const TEE = /^(?:.*[\\/])?(?:tee|Tee-Object)(?:\.exe)?$/i;
const MKTEMP = /^(?:.*[\\/])?mktemp(?:\.exe)?$/i;

// The Windows path a word of a Git Bash command names, or the word itself: Git Bash mounts the user's temporary
// folder at /tmp and each drive at /<letter>. It finds the mount after normalizing the path and whatever the letter
// case; two leading slashes, and no more, start a network path instead.
export function fromGitBash(word, temp = tmpdir()) {
  if (!word.startsWith('/') || /^\/\/(?!\/)/.test(word)) return word;
  const path = posix.normalize(word.replace(/^\/+/, '/'));
  if (/^\/tmp(?:\/|$)/i.test(path)) return `${temp}${path.slice(4)}`;
  return /^\/[A-Za-z](?:\/|$)/.test(path) ? `${path[1]}:/${path.slice(3)}` : word;
}

// Where mktemp creates its file or folder: the -p or --tmpdir folder, the folder of TMPDIR with -t or without a
// template, and otherwise the template, relative to the current folder.
function mktempPlace(args, tmpdir) {
  let dir = null;
  let prefixed = false;
  let template = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--tmpdir') dir = tmpdir;
    else if (arg.startsWith('--tmpdir=')) dir = arg.slice(9) || tmpdir;
    else if (/^-[^-]/.test(arg)) {
      prefixed ||= /^-[^p]*t/.test(arg);
      const p = arg.indexOf('p');
      if (p !== -1) dir = arg.slice(p + 1) || args[++i] || tmpdir;
    } else if (!arg.startsWith('-')) template ??= arg;
  }
  return dir ?? (prefixed || template === null ? tmpdir : template);
}

// What one command creates in a temporary folder, as the text that names it, or null.
function created(words, temp) {
  let start = 0;
  let tmpdir = '$TMPDIR';
  while (ASSIGNMENT.test(words[start] ?? '')) {
    const [name, ...value] = words[start++].split('=');
    if (name === 'TMPDIR') tmpdir = value.join('=');
  }
  const [name, ...args] = words.slice(start);
  if (/^New-TemporaryFile$/i.test(name ?? '')) return name;
  if (TEE.test(name ?? '')) return args.find((arg) => !arg.startsWith('-') && temp(arg)) ?? null;
  return MKTEMP.test(name ?? '') && temp(mktempPlace(args, tmpdir)) ? [name, ...args].join(' ') : null;
}

// The paths a command names as written, the targets of > and >> and the files tee or Tee-Object writes, in every
// reading; `readings` is as for shellTempWrite.
export function shellWrites(script, { readings }) {
  const written = [];
  for (const powershell of Array.isArray(script) ? [] : readings) {
    for (const { words, targets } of commands(String(script), { powershell })) {
      const [name, ...args] = words.slice(words.findIndex((word) => !ASSIGNMENT.test(word)));
      written.push(...targets, ...(TEE.test(name ?? '') ? args.filter((arg) => !arg.startsWith('-')) : []));
    }
  }
  return written;
}

// The first evident write into a temporary folder, as the text that names it, or null. `readings` lists the
// PowerShell readings to try, true for PowerShell; isTemp(path) judges an absolute path; gitBash says that Git Bash
// on Windows runs the POSIX readings.
export function shellTempWrite(script, { readings, cwd, isTemp, gitBash = false }) {
  const judge = (powershell) => (word) => {
    if (TEMP_VARIABLE.test(word)) return true;
    if (/[$%]/.test(word) || word === '') return false;
    const path = gitBash && !powershell ? fromGitBash(word) : word;
    // A word that cannot be resolved, as on a drive that does not exist, is no evident write; the rest are still judged.
    try {
      return isTemp(isAbsolute(path) ? path : `${cwd}${sep}${path}`);
    } catch {
      return false;
    }
  };
  for (const powershell of readings) {
    const temp = judge(powershell);
    const list = Array.isArray(script) ? [{ words: script.map(String), targets: [] }] : commands(String(script), { powershell });
    for (const { words, targets } of list) {
      const found = targets.find(temp) ?? created(words, temp);
      if (found) return found;
    }
  }
  return null;
}
