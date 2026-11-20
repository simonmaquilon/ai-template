// What must hold before the release script changes anything, in the order the script reports it: the repository is the
// maintained template, HEAD is on a branch, the working tree is clean, the version is MAJOR.MINOR.PATCH, the manifest is
// current, the tag of the version does not exist here, and the notes file has text. Runs from the repository root and
// only reads; returns { error } with the first problem, or { branch, version }.

import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { git } from './hook-support.mjs';
import { VERSION_FILE, maintainedTemplate, readText } from './template-files.mjs';

const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

export function readiness(notes) {
  if (!maintainedTemplate().maintained) return { error: 'this is not the maintained template, the only repository that releases' };
  const branch = git(['symbolic-ref', '--short', '-q', 'HEAD'])?.trim();
  if (!branch) return { error: 'HEAD is detached; check out the branch to release' };
  const status = git(['status', '--porcelain']);
  if (status === null) return { error: 'git status failed' };
  if (status.trim() !== '') return { error: 'the working tree has uncommitted changes; commit or discard them first' };
  const version = readText(VERSION_FILE)?.trim() ?? '';
  if (!VERSION.test(version)) return { error: `${VERSION_FILE} must hold MAJOR.MINOR.PATCH, not ${JSON.stringify(version)}` };
  const manifest = spawnSync(process.execPath, ['.scripts/template-manifest.mjs', '--check'], { encoding: 'utf8' });
  if (manifest.status !== 0) {
    return { error: `the template manifest is not current (node .scripts/template-manifest.mjs --check):\n${`${manifest.stdout}${manifest.stderr}`.trim()}` };
  }
  if (git(['rev-parse', '--verify', '-q', `refs/tags/${version}`]) !== null) return { error: `tag ${version} already exists here` };
  if (!statSync(notes, { throwIfNoEntry: false })?.isFile()) return { error: `the notes file ${notes} does not exist` };
  let text = '';
  try {
    text = readFileSync(notes, 'utf8');
  } catch {
    return { error: `the notes file ${notes} cannot be read` };
  }
  if (text.trim() === '') return { error: `the notes file ${notes} is empty` };
  return { branch, version };
}
