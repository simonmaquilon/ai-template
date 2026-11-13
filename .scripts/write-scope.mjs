// Decides where a file write lands, for the write-scope hook (03-code-authoring.md): inside the project, in one of
// the agent client's own files that stay writable, in a system temporary folder, or anywhere else. Paths compare by
// where they really lead: every existing segment is resolved through links, with the letter case the file system
// stores, so neither .., a link inside the project, nor another spelling of a folder changes the answer, and the
// segments that do not exist yet are appended as written. Inside means the project, its linked worktrees, and the
// directories its own or the user's settings declare in permissions.additionalDirectories; the client's files are the
// Markdown files of the project's auto memory and the plan files, under the Claude Code configuration folder.

import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

const MAX_LINKS = 40;
const POSIX_TEMP = ['/tmp', '/private/tmp', '/var/tmp', '/private/var/tmp', '/var/folders', '/private/var/folders'];

// Where an absolute path really leads; throws when it is relative, a segment cannot be read, or links loop. Segments
// that do not exist yet wait as written, and a .. cancels the last of them, so the resolution resumes from the real
// folder above, through its links; only Windows separates segments with a backslash too.
export function realTarget(path, links = 0) {
  if (!isAbsolute(path) || links > MAX_LINKS) throw new Error(`cannot resolve ${path}`);
  const { root } = parse(path);
  const segments = path.slice(root.length).split(sep === '\\' ? /[\\/]+/ : /\/+/).filter(Boolean);
  let current = realpathSync.native(root);
  const missing = [];
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === '.') continue;
    if (segments[i] === '..') {
      if (missing.length > 0) missing.pop();
      else current = dirname(current);
      continue;
    }
    if (missing.length > 0) {
      missing.push(segments[i]);
      continue;
    }
    const next = join(current, segments[i]);
    let stats;
    try {
      stats = lstatSync(next, { throwIfNoEntry: false });
    } catch (error) {
      if (error.code !== 'ENOTDIR') throw error;
    }
    if (!stats) {
      missing.push(segments[i]);
      continue;
    }
    try {
      current = realpathSync.native(next);
    } catch (error) {
      // A link whose target does not exist yet: a write through it creates that target.
      if (error.code !== 'ENOENT' || !stats.isSymbolicLink()) throw error;
      const link = readlinkSync(next);
      return realTarget([isAbsolute(link) ? link : `${current}${sep}${link}`, ...segments.slice(i + 1)].join(sep), links + 1);
    }
  }
  return join(current, ...missing);
}

export function within(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};
const real = (path) => {
  try {
    return realTarget(path);
  } catch {
    return null;
  }
};

// The project folder and its linked worktrees, the first being the main one, as git lists them.
function worktrees(project) {
  const run = spawnSync('git', ['-C', project, 'worktree', 'list', '--porcelain', '-z'], { encoding: 'utf8' });
  if (run.status !== 0) return [];
  return run.stdout.split('\0').filter((line) => line.startsWith('worktree ')).map((line) => resolve(line.slice(9)));
}

// A classifier of absolute paths for the project at `project`: 'inside', 'client', 'temp', or 'outside'. It throws
// when it cannot resolve a path. `scratchpad` is the session scratchpad the client reports, a temporary folder too.
export function writeScope({ project, scratchpad, env = process.env }) {
  const home = homedir();
  // A settings path: ~ for the home folder, absolute, or, given a base, relative to it.
  const expand = (entry, base) => {
    if (typeof entry !== 'string' || entry === '') return null;
    if (entry === '~' || /^~[\\/]/.test(entry)) return join(home, entry.slice(1));
    if (isAbsolute(entry)) return entry;
    return base ? resolve(base, entry) : null;
  };
  const config = env.CLAUDE_CONFIG_DIR || join(home, '.claude');
  const trees = worktrees(project);
  const user = readJson(join(config, 'settings.json'));
  const declared = [readJson(join(project, '.claude', 'settings.json')), readJson(join(project, '.claude', 'settings.local.json')), user]
    .flatMap((settings) => [settings?.permissions?.additionalDirectories ?? []].flat());
  const inside = [realTarget(project), ...[...trees, ...declared.map((entry) => expand(entry, project))].filter(Boolean).map(real)]
    .filter(Boolean);
  const names = new Set([project, trees[0]].filter(Boolean).map((path) => path.replace(/[^A-Za-z0-9]/g, '-')));
  if (env.CLAUDE_CODE_PROJECT_DIR_NAME) names.add(env.CLAUDE_CODE_PROJECT_DIR_NAME);
  const client = [...[...names].map((name) => join(config, 'projects', name, 'memory')), expand(user?.autoMemoryDirectory, null),
    join(config, 'plans')].filter(Boolean).map(real).filter(Boolean);
  const system = process.platform === 'win32'
    ? [env.SystemRoot && join(env.SystemRoot, 'Temp'), env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Temp')] : POSIX_TEMP;
  // A temporary root holding the project, as a checkout under /tmp, would put the whole project in it; it is left out.
  const temp = [tmpdir(), env.TMPDIR, env.TMP, env.TEMP, env.CLAUDE_CODE_TMPDIR, ...system]
    .filter((path) => typeof path === 'string' && isAbsolute(path)).map(real).filter((root) => root && !within(root, inside[0]));
  if (typeof scratchpad === 'string' && isAbsolute(scratchpad)) temp.push(realTarget(scratchpad));
  return (path) => {
    const target = realTarget(path);
    if (inside.some((root) => within(root, target))) return 'inside';
    if (extname(target).toLowerCase() === '.md' && client.some((root) => within(root, target))) return 'client';
    if (temp.some((root) => within(root, target))) return 'temp';
    return 'outside';
  };
}
