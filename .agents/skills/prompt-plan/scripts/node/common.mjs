// Helpers shared by record.mjs, apply.mjs, and revert.mjs; paths resolve from this file.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, statSync, utimesSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const patchDir = dirname(fileURLToPath(import.meta.url));
export const planDir = dirname(patchDir);
export const root = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: patchDir, encoding: 'utf8' }).stdout.trim();
export const planPath = relative(root, planDir).split('\\').join('/');
const MAX_BUFFER = 1024 ** 3;

// Runs git from the project root; returns stdout as text, or as a Buffer with { binary: true }.
export function git(args, { binary = false, ...options } = {}) {
  const result = spawnSync('git', args, { cwd: root, encoding: binary ? 'buffer' : 'utf8', maxBuffer: MAX_BUFFER, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} exited with ${result.status}:\n${result.stderr}`);
  return result.stdout;
}

// Fragment numbers in build/, in order, without the 00 index.
export function fragments() {
  return readdirSync(join(planDir, 'build'))
    .map((name) => /^(\d{2})-.+\.md$/.exec(name)?.[1])
    .filter((number) => number && number !== '00')
    .sort();
}

export function selectFragments(arg, { allowAll = true } = {}) {
  const all = fragments();
  if (arg === 'all' && allowAll) return all;
  const number = String(arg ?? '').padStart(2, '0');
  if (!all.includes(number)) throw new Error(`Usage: <fragment number${allowAll ? ' | all' : ''}>. Available fragments: ${all.join(', ')}`);
  return [number];
}

// Captures the working tree as a git tree without touching the repository index: a temporary index,
// seeded from the real one so tracked files that match ignore patterns stay included, then updated
// from the working tree. The plan directory stays out: git already leaves it out when it is ignored,
// and naming an ignored path in an exclude pathspec would make git add fail.
export function snapshotTree() {
  const indexFile = join(patchDir, '.snapshot-index');
  const realIndex = git(['rev-parse', '--git-path', 'index']).trim();
  const realIndexPath = isAbsolute(realIndex) ? realIndex : join(root, realIndex);
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };
  try {
    if (existsSync(realIndexPath)) {
      // Keep the index's own timestamps: git compares entries against them to rehash files changed in the
      // same second as the index was written, and a fresh timestamp would hide such a change.
      copyFileSync(realIndexPath, indexFile);
      const { atime, mtime } = statSync(realIndexPath);
      utimesSync(indexFile, atime, mtime);
    }
    const ignored = spawnSync('git', ['check-ignore', '-q', planPath], { cwd: root }).status === 0;
    git(['add', '-A', '--', '.', ...(ignored ? [] : [`:(exclude)${planPath}`])], { env });
    return git(['write-tree'], { env }).trim();
  } finally {
    rmSync(indexFile, { force: true });
  }
}

export const patchFile = (number) => join(patchDir, `${number}.patch`);
export const stateFile = (number) => join(patchDir, `${number}.state`);
export const beforeFile = (number) => join(patchDir, `${number}.before`);

export function loadState(number) {
  const file = stateFile(number);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

export const changesFiles = (number) => Object.keys(loadState(number)?.files ?? {}).length > 0;

// Current hash of a file as git would store it, or null when it does not exist.
export function currentHash(path) {
  if (!existsSync(join(root, path))) return null;
  return git(['hash-object', '--', path]).trim();
}

// Fragments with a recorded patch that changes files, in order; fragments that change no file are passed over.
export const recorded = () => fragments().filter((number) => loadState(number) && changesFiles(number));

// How many of the given fragments are applied in order, or null with the files that fit no point of the sequence.
export function position(numbers) {
  const states = numbers.map(loadState);
  const paths = [...new Set(states.flatMap((state) => Object.keys(state.files)))];
  const current = Object.fromEntries(paths.map((path) => [path, currentHash(path)]));
  for (let applied = numbers.length; applied >= 0; applied -= 1) {
    const matches = paths.every((path) => {
      const last = states.slice(0, applied).findLast((state) => path in state.files);
      const next = states.slice(applied).find((state) => path in state.files);
      return current[path] === (last ? last.files[path].after : next.files[path].before);
    });
    if (matches) return { applied, mismatched: [] };
  }
  const known = (path) => states.some((state) => path in state.files && [state.files[path].before, state.files[path].after].includes(current[path]));
  return { applied: null, mismatched: paths.filter((path) => !known(path)) };
}

export function refuse(message, mismatched = []) {
  console.error([message, ...mismatched].join('\n  '));
  process.exit(1);
}
