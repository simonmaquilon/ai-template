// Helpers shared by record.mjs, apply.mjs, and revert.mjs; paths resolve from this file.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, utimesSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

// The plan's folders by their real names on disk, as git names the repository's, so a path typed in another case
// still tells whether the plan lies inside the repository.
export const patchDir = realpathSync.native(dirname(fileURLToPath(import.meta.url)));
export const planDir = dirname(patchDir);
// The scripts need Node 18 or later, which Array.prototype.findLast and fetch need.
if (Number(process.versions.node.split('.')[0]) < 18) refuse(`prompt-plan's scripts need Node 18 or later; this is ${process.version}.`);
// Without git nothing here can run, which is no missing repository.
const probe = spawnSync('git', ['--version'], { encoding: 'utf8' });
if (probe.error || probe.status !== 0) refuse(`git could not run: ${probe.error?.message ?? probe.stderr.trim()}`);
// The snapshots need git 2.25 or later for --pathspec-from-file, so an older git is refused before anything else runs.
const [gitMajor, gitMinor] = (/(\d+)\.(\d+)/.exec(probe.stdout) ?? []).slice(1).map(Number);
const gitAtLeast = (wanted) => gitMajor > 2 || (gitMajor === 2 && gitMinor >= wanted);
if (!gitAtLeast(25)) refuse(`prompt-plan's patch scripts need git 2.25 or later; this is ${probe.stdout.trim()}.`);
const toplevel = (cwd) => spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).stdout?.trim() ?? '';
// The repository that holds the plan; for a plan outside any repository, such as one in the operating system's
// temporary folder, the repository of the directory the script runs from.
export const root = toplevel(patchDir) || toplevel(process.cwd());
if (!root) refuse('Neither the plan nor the current directory is in a git repository: run the script from the project.');
export const planPath = relative(root, planDir).split('\\').join('/');
const planInside = !isAbsolute(planPath) && planPath !== '..' && !planPath.startsWith('../');
const MAX_BUFFER = 1024 ** 3;
// Git applies GIT_DIFF_OPTS even to plumbing diffs, where --unified=0 makes hunks git apply rejects, and the pathspec
// variables change what the pathspecs below match, or make git refuse them. Without optional locks, the status git add
// runs in a nested repository never rewrites that repository's index.
const baseEnv = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
for (const name of ['GIT_DIFF_OPTS', 'GIT_EXTERNAL_DIFF', 'GIT_LITERAL_PATHSPECS', 'GIT_GLOB_PATHSPECS', 'GIT_NOGLOB_PATHSPECS', 'GIT_ICASE_PATHSPECS']) {
  delete baseEnv[name];
}

// Runs git from the project root; returns stdout as text, or as a Buffer with { binary: true }. With { none: true }, for
// a command that exits 1 when it finds nothing, as check-ignore and config --get-regexp do, that exit is no failure.
export function git(args, { binary = false, env = baseEnv, none = false, ...options } = {}) {
  const result = spawnSync('git', args, { cwd: root, encoding: binary ? 'buffer' : 'utf8', maxBuffer: MAX_BUFFER, env, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0 && !(none && result.status === 1)) throw new Error(`git ${args.join(' ')} exited with ${result.status}:\n${result.stderr}`);
  return result.stdout;
}

const nul = (paths) => paths.map((path) => `${path}\0`).join('');
// Appends one by one, since spreading a listing of a large tree into a call overflows the stack.
const append = (target, items) => {
  for (const item of items) target.push(item);
  return target;
};
// Pathspecs given on the command line go in groups that fit on one, Windows' the shortest, since the folders of a large
// tree would not: the fields each group's git command prints.
function inGroups(args, pathspecs, limit = 16000) {
  const fields = [];
  for (let start = 0; start < pathspecs.length;) {
    let end = start;
    for (let size = 0; end < pathspecs.length && (end === start || size + pathspecs[end].length < limit); end += 1) size += pathspecs[end].length + 1;
    append(fields, git([...args, '--', ...pathspecs.slice(start, end)]).split('\0'));
    start = end;
  }
  return fields;
}

// A nested repository is asked about itself, never through a variable that points git at the project's repository or
// at a snapshot's temporary index.
const nestedEnv = Object.fromEntries(Object.entries(baseEnv).filter(([name]) => ![
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_PREFIX',
].includes(name)));
export const nestedGit = (folder, args) => spawnSync('git', ['-C', folder, ...args], { encoding: 'utf8', env: nestedEnv });
// Whether a folder of the working tree is a repository of its own, not one inside the project's repository.
export const ownRepository = (folder) => {
  const top = nestedGit(folder, ['rev-parse', '--show-toplevel']).stdout?.trim();
  return Boolean(top) && realpathSync.native(top) === realpathSync.native(folder);
};
const configTrue = (key) => spawnSync('git', ['config', '--bool', key], { cwd: root, env: baseEnv, encoding: 'utf8' }).stdout?.trim() === 'true';
// Whether the file system that holds the working tree ignores case, told without writing anything, and once: the working
// tree's own .git entry, a folder or a file that names the git directory, under the root's real name, with its case
// flipped, is the same entry only on such a file system. The git directory is no stand-in for it, since a linked worktree
// and a repository with a separate git directory keep theirs elsewhere, perhaps on another file system; it is asked, with
// the case flipped in the last of its folders that has a letter, only for a root that has no .git entry. git's
// configuration can say otherwise, as core.ignorecase false or unset does in a repository made on a file system that
// tells names apart by case and then copied to one that does not, which requireCaseConfig refuses.
let blind;
function fileSystemIgnoresCase() {
  if (blind === undefined) {
    blind = false;
    try {
      const flip = (name) => name.replace(/[a-z]/gi, (letter) => (letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase()));
      const entry = join(realpathSync.native(root), '.git');
      const path = lstatSync(entry, { throwIfNoEntry: false }) ? entry : realpathSync.native(git(['rev-parse', '--absolute-git-dir']).trim());
      const parts = path.split(sep);
      const at = parts.findLastIndex((part) => flip(part) !== part);
      const real = lstatSync(path, { bigint: true });
      const other = at < 0 ? undefined : lstatSync(parts.map((part, i) => (i === at ? flip(part) : part)).join(sep), { bigint: true, throwIfNoEntry: false });
      // An inode of 0 is no identity, as some file systems report, so it proves nothing.
      blind = Boolean(other) && real.ino !== 0n && other.ino === real.ino && other.dev === real.dev;
    } catch {
      // No answer, which leaves the configuration to decide.
    }
  }
  return blind;
}
export const ignoresCase = () => configTrue('core.ignorecase') || fileSystemIgnoresCase();
// git init and git clone set core.ignorecase to true where the file system ignores case, and git reads it as false when
// it is unset, as in a repository copied there from a file system that tells names apart. Anything but true there makes
// git and the disk disagree about which names exist: git takes notes.md and NOTES.md for two files while the disk holds
// one, git mv -f of one to the other gets past git's own refusal, and Git for Windows takes a file renamed only in case
// for deleted, so a patch could write an old file over the renamed one. The scripts refuse to run until it is set as git
// sets it.
export function requireCaseConfig() {
  const set = spawnSync('git', ['config', '--bool', 'core.ignorecase'], { cwd: root, env: baseEnv, encoding: 'utf8' }).stdout?.trim();
  if (set !== 'true' && fileSystemIgnoresCase()) {
    refuse('Refusing to run: core.ignorecase is not true, and git reads it as false when it is unset, but the file system that holds the working tree ignores case, so git and the disk disagree about which names exist; set it as git sets it on such a file system, with git config core.ignorecase true, and run again.');
  }
}
// A path git reads in an alternates variable, quoted when it holds the separator or starts with a quote.
const alternatePath = (path) => (path.includes(delimiter) || path.startsWith('"') ? `"${path.replace(/[\\"]/g, '\\$&')}"` : path);
// What stands at a path, or nothing, also when a file stands where one of its folders should be.
export const onDisk = (path) => {
  try {
    return lstatSync(join(root, path), { throwIfNoEntry: false });
  } catch {
    return undefined;
  }
};
// Whether every folder above a path is a real directory now. Otherwise the path is no file of the working tree: through a
// link in one of its folders it reads another file, one of the link's target, which git refuses to add to an index
// ("beyond a symbolic link"), and under a file there is nothing to read.
export const inRealFolders = (path) => path.split('/').slice(0, -1).every((_, i, folders) => onDisk(folders.slice(0, i + 1).join('/'))?.isDirectory());
// The paths that changes, as rawChanges gives them in the direction they are written, must create while something
// they do not remove stands there: a folder holding anything they do not delete, or a file or link where one of the
// path's folders should be. git apply deletes before it creates, but checks neither, so it would fail halfway.
export function obstructed(changes) {
  const deleted = new Set(Object.keys(changes).filter((path) => changes[path].before !== null && changes[path].after === null));
  // Names on disk compared as the file system compares them, since git may spell them otherwise, composed on macOS.
  const deletedKeys = new Set([...deleted].map(pathKey));
  const emptied = (dir) => {
    let names;
    try {
      names = readdirSync(join(root, dir));
    } catch {
      return false;
    }
    return names.length > 0 && names.every((name) => deletedKeys.has(pathKey(`${dir}/${name}`)) || (onDisk(`${dir}/${name}`)?.isDirectory() && emptied(`${dir}/${name}`)));
  };
  return Object.keys(changes).filter((path) => changes[path].before === null && changes[path].after !== null).filter((path) => {
    if (onDisk(path)?.isDirectory() && !emptied(path)) return true;
    return path.split('/').slice(0, -1).some((_, i, parts) => {
      const folder = parts.slice(0, i + 1).join('/');
      const stat = onDisk(folder);
      return stat && !stat.isDirectory() && !deletedKeys.has(pathKey(folder));
    });
  });
}
// The same changes written the other way, as revert writes a fragment's.
export const reversed = (changes) => Object.fromEntries(Object.entries(changes).map(([path, { before, after }]) => [path, { before: after, after: before }]));

// Writes a patch file to the working tree, backwards with reverse; changes are its changes in the direction it is written,
// as rawChanges gives them. git apply checks every file the patch creates against what stands there before it deletes
// any, so where the file system ignores case it refuses the patch of a rename that only changes case, such as git mv
// notes.md NOTES.md, which deletes one spelling and adds the other, in either direction. No record holds such a rename,
// but a restore writes one back when a failed fragment made it. A path the patch deletes and adds files under, such as a
// link replaced by a folder, is a deletion git may fail to perform without saying so, as in a folder no one can write,
// and the files would then be written through the link, into its target, over files of the same names. Such a patch goes
// in two passes: the deletions of the paths that an addition shares a key with and of those that an addition lies under,
// confirmed gone, then the rest, checked before it is written. If the rest does not apply, the deletions are undone, so
// nothing stays half-written, and git's reason is thrown. The same goes for the first pass when git only warns that it
// could not delete one of the paths, as in a folder the owner cannot write, while it deleted the others: those deletions
// are undone, so that pass leaves nothing written either. Any other patch is checked and written at once. A check that
// fails writes nothing, but git apply can fail while writing, such as into a folder the owner cannot write, after its
// check passed, and then the working tree may hold part of the patch: that failure, a failed undoing of the deletions,
// and a file git only warned it could not delete, are thrown as a PartialWrite, whose message is git's reason or the
// files left standing.
export class PartialWrite extends Error {}
// What the callers' refusals say of the working tree after a PartialWrite.
export const PARTIAL = "the working tree may now hold part of that fragment's patch";
export function writePatch(file, changes, { reverse = false } = {}) {
  const changed = Object.keys(changes);
  const additions = changed.filter((path) => changes[path].before === null && changes[path].after !== null);
  const added = new Set(additions.map(pathKey));
  // The folders above each addition, by key.
  const above = new Set(additions.flatMap((path) => path.split('/').slice(0, -1).map((_, i, parts) => pathKey(parts.slice(0, i + 1).join('/')))));
  const first = changed.filter((path) => changes[path].before !== null && changes[path].after === null
    && ((ignoresCase() && added.has(pathKey(path))) || above.has(pathKey(path))));
  const apply = (limits, { check = false, backwards = reverse } = {}) => git(['apply', ...(backwards ? ['-R'] : []), ...(check ? ['--check'] : []), '--whitespace=nowarn', ...limits, file]);
  // git apply only warns that it is unable to unlink a file it deletes, as in a folder the owner cannot write, and exits 0,
  // so after a write each path that pass deletes must be gone; one that stands where an addition shares its key is the
  // addition's file, not the one left behind, unless the pass writes no addition, as the first of two passes does, where
  // whatever stands is the deleted file. A path whose folder is a link now is read through it, as another file, such
  // as when the patch replaces a folder by a link to one holding the same names, so only a path whose folders are all
  // real directories after the write can be one left behind. The PartialWrite for those paths carries them as standing.
  const write = (limits, paths, { additions = true } = {}) => {
    try {
      apply(limits);
    } catch (error) {
      throw new PartialWrite(error.message, { cause: error });
    }
    const standing = paths.filter((path) => changes[path].before !== null && changes[path].after === null && !(additions && added.has(pathKey(path)))
      && inRealFolders(path)
      && (onDisk(path)?.isFile() || onDisk(path)?.isSymbolicLink()));
    if (standing.length) throw Object.assign(new PartialWrite(`git could not delete these files, which the patch removes and which still stand:\n  ${standing.join('\n  ')}`), { standing });
  };
  if (!first.length) {
    apply([], { check: true });
    write([], changed);
    return;
  }
  // The limits are wildmatch patterns, which a path must not be read as.
  const patterns = first.map((path) => path.replace(/[*?[\\]/g, '\\$&'));
  const deletions = patterns.map((pattern) => `--include=${pattern}`);
  const rest = patterns.map((pattern) => `--exclude=${pattern}`);
  apply(deletions, { check: true });
  try {
    write(deletions, first, { additions: false });
  } catch (error) {
    // The paths the pass deletes that did not stay are gone, and are put back, as when the rest does not apply.
    const gone = patterns.filter((_, i) => error.standing && !error.standing.includes(first[i])).map((pattern) => `--include=${pattern}`);
    if (gone.length) {
      try {
        apply(gone, { backwards: !reverse });
      } catch (undoing) {
        throw new PartialWrite(`${error.message}\nUndoing the deletions it confirmed failed too:\n${undoing.message}`, { cause: error });
      }
    }
    throw error;
  }
  try {
    apply(rest, { check: true });
  } catch (error) {
    try {
      apply(deletions, { backwards: !reverse });
    } catch (undoing) {
      throw new PartialWrite(`${error.message}\nUndoing the deletions it followed failed too:\n${undoing.message}`, { cause: error });
    }
    throw error;
  }
  write(rest, changed.filter((path) => !first.includes(path)));
}

// A path as the file system tells it from others: composed on macOS, as git spells it there, and without case where
// the file system ignores case.
let fold;
export const pathKey = (path) => {
  // No logical assignment, which Node 14 cannot parse, so an older Node still reaches the version check above.
  fold = fold ?? (ignoresCase() ? (text) => text.toLowerCase() : (text) => text);
  return fold(process.platform === 'darwin' ? path.normalize('NFC') : path);
};

export const inPlan = (path) => planInside && (path === planPath || path.startsWith(`${planPath}/`));

// Every record names the repository or worktree it was taken in, and the scripts refuse to go on in another one, since
// a plan outside any repository runs on the repository of the folder its scripts run from.
export function requireRoot(recorded, what) {
  if (recorded && recorded !== root) refuse(`${what} was taken in another repository or worktree, ${recorded}; run the scripts from there, not from ${root}.`);
}

// Snapshots keep their objects in patch/objects, which git gc never prunes, and read the repository's own objects as
// an alternate; the repository's path is read before either variable is set, since they change it.
let store;
export function storeEnv(extra = {}) {
  if (!store) {
    const found = git(['rev-parse', '--git-path', 'objects']).trim();
    const objects = isAbsolute(found) ? found : join(root, found);
    // Git takes a missing object directory for no repository at all.
    mkdirSync(join(patchDir, 'objects', 'pack'), { recursive: true });
    // Alternates the environment already names keep the objects only they hold readable.
    const alternates = [alternatePath(objects), baseEnv.GIT_ALTERNATE_OBJECT_DIRECTORIES].filter(Boolean).join(delimiter);
    store = { GIT_OBJECT_DIRECTORY: join(patchDir, 'objects'), GIT_ALTERNATE_OBJECT_DIRECTORIES: alternates };
  }
  return { ...baseEnv, ...store, ...extra };
}

// Plumbing diffs between two snapshots, which read none of the configuration that changes a porcelain patch, such as
// prefixes, colors, context, external tools, or text conversion; the options say so as well, renames stay a deletion
// and an addition as NN.state lists them, and nested repositories are never ignored.
const SNAPSHOT_DIFF = ['diff-tree', '-r', '--no-renames', '--ignore-submodules=none'];
export const PATCH = [...SNAPSHOT_DIFF, '-p', '--binary', '--full-index', '--no-color', '--no-ext-diff', '--no-textconv',
  '--src-prefix=a/', '--dst-prefix=b/', '--submodule=short'];
export const NAMES = [...SNAPSHOT_DIFF, '-z', '--name-only'];

// Each path two snapshots differ in, with its mode and object before and after as "<mode> <object>", or null where
// the path is absent.
export const rawChanges = (from, to) => parseRaw(git([...SNAPSHOT_DIFF, '-z', '--raw', '--no-abbrev', from, to], { env: storeEnv() }));
function parseRaw(output) {
  const fields = output.split('\0').filter(Boolean);
  const entry = (mode, object) => (/^0+$/.test(object) ? null : `${mode} ${object}`);
  const files = {};
  for (let i = 0; i < fields.length; i += 2) {
    const [oldMode, newMode, oldObject, newObject] = fields[i].slice(1).split(' ');
    files[fields[i + 1]] = { before: entry(oldMode, oldObject), after: entry(newMode, newObject) };
  }
  return files;
}

// The nested repositories among changed files, as gitlinks to their commits: no patch carries a repository's contents.
export const gitlinks = (files) => Object.entries(files)
  .filter(([, change]) => [change.before, change.after].some((entry) => entry?.startsWith('160000 ')))
  .map(([path, change]) => `${path}: ${change.before ?? 'absent'} -> ${change.after ?? 'absent'}`);

// Of the paths, those whose filter attribute names a driver that the configuration defines, with a clean or process
// command, and a filter git cannot run hides nothing. The configuration alone decides: check-attr prints set for a bare
// filter and for filter=set alike, and git runs a driver named set for the second only, so set, unset, and unspecified
// count when a driver bears that name; for a bare attribute git runs no driver, and the caller finds the bytes unchanged.
// Line endings and the $Id$ keyword change only what a checkout writes again, so they lose nothing and are no concern of
// the paths this keeps. They come as a map to the driver's name, which hiddenBytes disables to see what it changes.
function filtered(paths) {
  if (!paths.length) return new Map();
  const fields = git(['check-attr', '-z', '--stdin', 'filter'], { input: nul(paths) }).split('\0');
  const named = new Map();
  for (let i = 0; i + 2 < fields.length; i += 3) named.set(fields[i], fields[i + 2]);
  // Each record is a key, a newline, and the value; a driver's name may hold dots and any character, so [^] matches it.
  const defined = new Set(git(['config', '-z', '--get-regexp', '^filter\\..*\\.(clean|process)$'], { none: true }).split('\0')
    .filter(Boolean).map((record) => /^filter\.([^]*)\.(?:clean|process)$/.exec(record.split('\n')[0])[1]));
  return new Map(paths.filter((path) => defined.has(named.get(path))).map((path) => [path, named.get(path)]));
}
// The names hash-object --stdin-paths reads, one per line, quoted where they hold a quote, a backslash, or a line break.
const stdinPaths = (paths) => paths.map((path) => `"${path.replace(/[\\"]/g, '\\$&').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"\n`).join('');
// A word as git quotes it in GIT_CONFIG_PARAMETERS (sq_quote_buf): in single quotes, where a quote or an exclamation
// mark gets a backslash between two closed quotes.
const quoted = (text) => `'${text.replace(/'/g, "'\\''").replace(/!/g, "'\\!'")}'`;
// The environment that disables a filter driver: its clean and process commands are empty, which git takes for none, and
// it is no longer required, so git runs nothing for it and fails on nothing. The settings go through GIT_CONFIG_COUNT
// after any the environment already holds, since a name may hold an equals sign, where -c would split it. Git reads
// GIT_CONFIG_PARAMETERS, the settings of git -c, after those variables, and Claude Code's sandboxed shell always fills
// it, so a driver it defines, a process command above all, would keep running; the same settings therefore join it after
// its own entries, each key and value quoted apart, as git writes an entry since 2.31 and parses it for any name, and
// the later entry wins. Git before 2.31 ignores those variables and that form and would run the driver all the same, so
// there this gives null.
function withoutDriver(name) {
  if (!gitAtLeast(31)) return null;
  const first = Number(baseEnv.GIT_CONFIG_COUNT) || 0;
  const settings = [['clean', ''], ['process', ''], ['required', 'false']];
  const added = settings.map(([key, value]) => `${quoted(`filter.${name}.${key}`)}=${quoted(value)}`).join(' ');
  return {
    ...baseEnv,
    GIT_CONFIG_COUNT: String(first + settings.length),
    ...Object.fromEntries(settings.flatMap(([key, value], i) => [[`GIT_CONFIG_KEY_${first + i}`, `filter.${name}.${key}`], [`GIT_CONFIG_VALUE_${first + i}`, value]])),
    GIT_CONFIG_PARAMETERS: [baseEnv.GIT_CONFIG_PARAMETERS, added].filter(Boolean).join(' '),
  };
}
// Snapshots hash through clean filters, so a file whose bytes a lossy filter changes, such as one that redacts a password,
// matches a recorded state although writing a change would overwrite bytes no object holds. Among the files of changes,
// as rawChanges gives them in the direction they are written, those that are regular files where the change expects a
// blob and that a filter driver changes, and whose bytes differ from git's checkout of that blob; a driver that checkout
// undoes hides nothing, and neither does one that changes nothing: hashed with the driver disabled, the file gives the
// same object, so what sets the two hashes below apart is line endings or an $Id$ keyword, which a checkout writes
// again. A path under a link reads another file, one of the link's target, so it is no file of the working tree and is
// passed over. hash-object reads a path per line, and unquotes one that starts with a quote.
function hiddenBytes(changes) {
  const drivers = filtered(Object.keys(changes).filter((path) => changes[path].before?.startsWith('100') && inRealFolders(path) && onDisk(path)?.isFile()));
  const paths = [...drivers.keys()];
  if (!paths.length) return [];
  const input = stdinPaths(paths);
  const raw = git(['hash-object', '--no-filters', '--stdin-paths'], { input }).split('\n');
  const cleaned = git(['hash-object', '--stdin-paths'], { input }).split('\n');
  // One call per driver, since the settings that disable it are its own.
  const unchanged = new Set();
  for (const name of new Set(drivers.values())) {
    const env = withoutDriver(name);
    const asked = paths.map((_, i) => i).filter((i) => drivers.get(paths[i]) === name && raw[i] !== cleaned[i]);
    if (!env || !asked.length) continue;
    const bare = git(['hash-object', '--stdin-paths'], { input: stdinPaths(asked.map((i) => paths[i])), env }).split('\n');
    asked.forEach((i, j) => {
      if (bare[j] === cleaned[i]) unchanged.add(paths[i]);
    });
  }
  return paths.filter((path, i) => {
    if (raw[i] === cleaned[i] || unchanged.has(path)) return false;
    // One call per file, since the sizes cat-file --batch --filters prints are those of the blobs, not of the output.
    try {
      const checkout = git(['cat-file', '--filters', `--path=${path}`, changes[path].before.split(' ')[1]], { binary: true, env: storeEnv() });
      return !checkout.equals(readFileSync(join(root, path)));
    } catch {
      return true; // No checkout of the entry to compare with, so nothing shows that these bytes survive it.
    }
  });
}
// Refuses, before anything is written, the files of changes whose bytes a clean filter hides.
export function requireVisible(changes, subject, action, outcome = '') {
  let hidden;
  try {
    hidden = hiddenBytes(changes);
  } catch (error) {
    refuse('The files a filter changes could not be compared with their recorded state:', [error.message.trim()]);
  }
  if (hidden.length) refuse(`${subject}: a filter git runs on these files hides bytes they hold now, which ${action} would overwrite${outcome}; keep a copy and undo those bytes, or move the files aside, first:`, hidden);
}

// Fragment numbers in build/, in order, without the 00 index.
export function fragments() {
  if (!existsSync(join(planDir, 'build'))) refuse(`The plan at ${planDir} has no build/ folder of fragments.`);
  const names = readdirSync(join(planDir, 'build')).filter((name) => /^\d{2}-.+\.md$/.test(name) && !name.startsWith('00-')).sort();
  const numbers = names.map((name) => name.slice(0, 2));
  // Two build files with one number, as a renumbering left halfway would, make every count of fragments wrong.
  const shared = names.filter((_, i) => numbers.indexOf(numbers[i]) !== numbers.lastIndexOf(numbers[i]));
  if (shared.length) refuse('Build files share a fragment number; give each fragment its own:', shared);
  return numbers;
}

export function selectFragments(arg, { allowAll = true } = {}) {
  const all = fragments();
  if (arg === 'all' && allowAll) return all;
  const number = String(arg ?? '').padStart(2, '0');
  if (!all.includes(number)) refuse(`Usage: <fragment number${allowAll ? ' | all' : ''}>. Available fragments: ${all.join(', ')}`);
  return [number];
}

// Each run keeps its temporary index, and git's lock on it, in a folder of its own; one a killed run left behind is
// removed once its process is gone and the folder is old enough that no run of another process namespace, such as a
// sandbox's, can still be using it.
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};
const STALE_MS = 10 * 60 * 1000;
function sweepIndexes() {
  for (const name of readdirSync(patchDir)) {
    const pid = Number(/^\.snapshot-(\d+)-/.exec(name)?.[1]);
    if (!pid || pid === process.pid || alive(pid)) continue;
    if ((lstatSync(join(patchDir, name), { throwIfNoEntry: false })?.mtimeMs ?? Infinity) < Date.now() - STALE_MS) {
      rmSync(join(patchDir, name), { recursive: true, force: true });
    }
  }
}

// git add skips what assume-unchanged and skip-worktree hide, so the temporary index clears those marks for files on
// disk, as git 2.37 and later do themselves for skip-worktree in a sparse checkout; git 2.34 and later also need
// --sparse to take files outside a sparse checkout. A file under a link is none on disk: git add would find its entry
// removed, so the mark stays and the entry with it.
function clearMarks(run) {
  const records = run(['ls-files', '-z', '-v']).split('\0').filter(Boolean);
  const marked = (pattern) => records.filter((record) => pattern.test(record)).map((record) => record.slice(2));
  const assumed = marked(/^[hs] /);
  const skipped = marked(/^[Ss] /).filter((path) => inRealFolders(path) && onDisk(path));
  // Each call clears one mark: update-index applies only the first marking option it is given.
  if (assumed.length) run(['update-index', '-z', '--no-assume-unchanged', '--stdin'], nul(assumed));
  if (skipped.length) run(['update-index', '-z', '--no-skip-worktree', '--stdin'], nul(skipped));
}
const sparseOption = () => (gitAtLeast(34) ? ['--sparse'] : []);

// The mode and object of each file in a tree, as "<mode> <object>" by path.
function treeMap(run, tree) {
  return new Map(run(['ls-tree', '-r', '-z', '--full-tree', tree]).split('\0').filter(Boolean).map((record) => {
    const tab = record.indexOf('\t');
    const [mode, , object] = record.slice(0, tab).split(' ');
    return [record.slice(tab + 1), `${mode} ${object}`];
  }));
}

// Which of the given paths version control ignores by a rule of its own. A folder is spelled without its slash, since
// with it a rule such as out/* matches the folder itself. check-ignore reads each name as a pathspec, so each goes with
// a ./ before it, which keeps a name such as :(x from being read as pathspec magic, and echoes it that way. It exits 1
// when it ignores none of them.
function ignoredAmong(paths) {
  let echoed;
  try {
    echoed = git(['check-ignore', '-z', '--stdin'], { input: nul(paths.map((path) => `./${path}`)), none: true });
  } catch (error) {
    refuse('Which untracked folders version control ignores could not be told:', [error.message.trim()]);
  }
  return new Set(echoed.split('\0').map((name) => name.replace(/^\.\//, '')));
}

// The untracked names now, outside the plan. Each file version control does not ignore comes by name, so a file created
// later in a folder of such files is new; what it ignores comes from status, which names an ignored file one by one
// where its folder also holds a file that is not ignored, as a negation rule or an untracked sibling makes it, and a
// wholly ignored folder as one entry, as node_modules/ is, and an empty folder as none, since it holds no file to tell
// from a new one. ls-files --directory would collapse the mixed folder and lose its ignored files. A folder that holds
// only ignored files is one entry too, although no rule ignores the folder itself, as *.log does for data/ with two
// logs in it; it stays one entry only where a rule ignores it, and otherwise comes as the ignored files inside it, so
// that a file made there later, which no rule ignores, is new.
export function untrackedNow() {
  const fields = (args) => git(args).split('\0');
  const names = fields(['ls-files', '-z', '--others', '--exclude-standard']);
  const records = fields(['status', '--porcelain=v1', '-z', '--ignored=traditional', '--untracked-files=normal']);
  const folders = [];
  for (let i = 0; i < records.length; i += 1) {
    const flags = records[i].slice(0, 2);
    if (flags === '!!') (records[i].endsWith('/') ? folders : names).push(records[i].slice(3));
    // A rename or copy carries its source as a field of its own, which is no entry.
    else if (/[RC]/.test(flags)) i += 1;
  }
  if (folders.length) {
    const ignored = ignoredAmong(folders.map((folder) => folder.slice(0, -1)));
    append(names, folders.filter((folder) => ignored.has(folder.slice(0, -1))));
    const opened = folders.filter((folder) => !ignored.has(folder.slice(0, -1)));
    append(names, inGroups(['ls-files', '-z', '--others', '--ignored', '--exclude-standard'], opened.map((folder) => `:(literal)${folder}`)));
  }
  // status leaves out the ignored files of a folder that stands where a tracked file was, so they come one by one.
  const standing = git(['ls-files', '-z', '--stage']).split('\0').filter(Boolean)
    .map((record) => [record.slice(0, record.indexOf(' ')), record.slice(record.indexOf('\t') + 1)])
    .filter(([mode, path]) => mode !== '160000' && onDisk(path)?.isDirectory())
    .map(([, path]) => `:(literal)${path}`);
  append(names, inGroups(['ls-files', '-z', '--others', '--exclude-standard', '--ignored'], standing));
  return [...new Set(names)].filter((path) => path && !inPlan(path));
}

// Whether a path was untracked at a before record whose list is names: named there, or under a folder it names, which
// ends with a slash.
export function untrackedBefore(names) {
  const keys = new Set(names.map(pathKey));
  return (path) => {
    const parts = path.replace(/\/$/, '').split('/');
    return keys.has(pathKey(path)) || parts.some((_, i) => keys.has(pathKey(`${parts.slice(0, i + 1).join('/')}/`)));
  };
}

// The untracked files version control does not ignore, outside the plan, that the working tree did not hold at the
// before record, whose names wasUntracked tells; each file is named, so a folder that was new is never one entry.
export const newUntracked = (wasUntracked) => git(['ls-files', '-z', '--others', '--exclude-standard']).split('\0')
  .filter((path) => path && !inPlan(path) && !wasUntracked(path));

// Captures the working tree as a git tree without touching the repository index: a temporary index, seeded from the
// real one, holds the files the index tracks, as the working tree holds them now, and the files adopted, which this or
// an earlier record took in with --include. No other file is read, so no untracked file, ignored or not, is hashed or
// stored; a tracked or adopted one stays whatever ignore rules say, as it does for git. The plan's own files stay out
// even when the index tracks them, as after a commit of the work.
// A change to the index itself never adds a file of the user's: where untracked lists the names untracked at the before
// record, a file the index tracks since, such as after git add, was no fragment's to write, and stays out unless it is
// adopted; taking a file out of the index while it stays on disk is refused before any snapshot, by requireIndexed.
// With leaveNew, a file the index tracks that base, an earlier snapshot, lacks and no adoption covers, such as one the
// fragment created and staged, is left out too, since a restore writes nothing to it.
// A transient snapshot, which apply and revert take only to compare, writes its objects into its own folder, removed
// with it, so they store nothing, and returns the entries of the paths wanted names, and its changes since changesFrom
// as rawChanges gives them, before that folder goes. It also returns staged, the files left out for having been
// untracked at the before record, and added, those left out as new.
export function snapshotTree({ base, adopted = [], untracked, transient = false, wanted = [], leaveNew = false, changesFrom } = {}) {
  sweepIndexes();
  const realIndex = git(['rev-parse', '--git-path', 'index']).trim();
  const realIndexPath = isAbsolute(realIndex) ? realIndex : join(root, realIndex);
  const stored = storeEnv();
  const dir = mkdtempSync(join(patchDir, `.snapshot-${process.pid}-`));
  const indexFile = join(dir, 'index');
  const objects = transient ? join(dir, 'objects') : null;
  const transientStore = objects
    ? { GIT_OBJECT_DIRECTORY: objects, GIT_ALTERNATE_OBJECT_DIRECTORIES: [alternatePath(stored.GIT_OBJECT_DIRECTORY), stored.GIT_ALTERNATE_OBJECT_DIRECTORIES].join(delimiter) }
    : {};
  // Untranslated messages, so a refusal quotes git's own words whatever the user's language.
  const env = storeEnv({ GIT_INDEX_FILE: indexFile, LC_ALL: 'C', ...transientStore });
  // A split index would make writing the temporary one write a shared index into the repository.
  const run = (args, input) => git(['-c', 'core.splitIndex=false', ...args], { env, input });
  let failure;
  try {
    if (objects) mkdirSync(join(objects, 'pack'), { recursive: true });
    if (existsSync(realIndexPath)) {
      // Keep the index's own timestamps: git compares entries against them to rehash files changed in the
      // same second as the index was written, and a fresh timestamp would hide such a change.
      copyFileSync(realIndexPath, indexFile);
      const { atime, mtime } = statSync(realIndexPath);
      utimesSync(indexFile, atime, mtime);
    }
    // The plan's own files stay out even when the repository's index tracks them, as after a commit of the work.
    if (planInside) run(['rm', '--cached', '-r', '-f', '-q', '--ignore-unmatch', '--', `:(literal)${planPath}`]);
    clearMarks(run);
    // A base that cannot be read has no entry, which requireSnapshot reports.
    let baseEntries = new Map();
    if (base) {
      try {
        baseEntries = treeMap(run, base);
      } catch {
        // Reported there.
      }
    }
    const adoptedKeys = new Set(adopted.map(pathKey));
    const listed = run(['ls-files', '-z', '--stage']).split('\0').filter(Boolean)
      .map((record) => [record.slice(0, record.indexOf(' ')), record.slice(record.indexOf('\t') + 1)]);
    const indexed = listed.map(([, path]) => path);
    const wasUntracked = untracked && untrackedBefore(untracked);
    // A file tracked since the before record that was untracked then is out of the index before git add reads it, so
    // nothing hashes it, and so is, with leaveNew, a new file other than a nested repository; an adopted one comes back
    // below. One base holds was tracked then, since requireIndexed refused any that stood out of the index, and matches
    // an untracked name only as another spelling of it, such as a decomposed café.md beside a tracked composed one where
    // git keeps decomposed names on macOS.
    const baseKeys = new Set([...baseEntries.keys()].map(pathKey));
    const staged = new Set(wasUntracked ? indexed.filter((path) => wasUntracked(path) && !baseKeys.has(pathKey(path))) : []);
    const added = leaveNew
      ? listed.filter(([mode, path]) => mode !== '160000' && !staged.has(path) && !baseKeys.has(pathKey(path)) && !adoptedKeys.has(pathKey(path))).map(([, path]) => path)
      : [];
    const dropped = new Set([...staged, ...added]);
    if (dropped.size) run(['update-index', '--force-remove', '-z', '--stdin'], nul([...dropped]));
    const tracked = indexed.filter((path) => !dropped.has(path));
    // Naming an ignored path in an exclude pathspec would make git add fail, so the plan is named only when it is not.
    const planExcluded = planInside && spawnSync('git', ['check-ignore', '-q', planPath], { cwd: root, env: baseEnv }).status !== 0;
    // With nothing tracked, git add -u takes its pathspec for one that matches no file.
    if (tracked.length) {
      run(['add', '-u', ...sparseOption(), '--pathspec-from-file=-', '--pathspec-file-nul'], nul(['.', ...(planExcluded ? [`:(exclude,literal)${planPath}`] : [])]));
    }
    // git add skips a nested repository that .gitmodules marks ignore = all, whatever the configuration says, so each
    // one the index tracks takes the commit it has checked out, as git add takes it for any other; a folder that is no
    // repository of its own, or one with no commit, keeps its entry, as git add keeps it.
    const links = listed.filter(([mode, path]) => mode === '160000' && !dropped.has(path) && inRealFolders(path) && onDisk(path)?.isDirectory())
      .flatMap(([, path]) => {
        const folder = join(root, path);
        const head = ownRepository(folder) ? nestedGit(folder, ['rev-parse', '--verify', '-q', 'HEAD']).stdout?.trim() : '';
        return /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(head ?? '') ? [`160000 ${head}\t${path}\0`] : [];
      });
    if (links.length) run(['update-index', '-z', '--index-info'], links.join(''));
    // update-index refuses a folder, but a path that is neither on disk nor in the index is no error: it stays absent. So
    // does one under a link, which update-index refuses, or under a file, since no file of the working tree is there.
    const taken = adopted.filter((path) => inRealFolders(path) && !onDisk(path)?.isDirectory());
    if (taken.length) run(['update-index', '--add', '--remove', '-z', '--stdin'], nul(taken));
    const tree = run(['write-tree']).trim();
    // An adopted file comes back below, so it is no file left out.
    const entries = wanted.length ? treeEntries(run, tree, wanted) : {};
    const changes = changesFrom ? parseRaw(run([...SNAPSHOT_DIFF, '-z', '--raw', '--no-abbrev', changesFrom, tree])) : null;
    return { tree, entries, changes, staged: [...staged].filter((path) => !adoptedKeys.has(pathKey(path))), added };
  } catch (error) {
    failure = error;
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
  refuse('The working tree could not be captured as a snapshot:', [failure.message.trim()]);
}

// Refuses a snapshot missing objects that it shared with the repository, such as a file staged before it, and that
// git gc pruned there once nothing else used them; every object the snapshot wrote itself stays in patch/objects. A
// partial clone's objects that its promisor remote still holds, such as blobs outside a sparse checkout, are no loss.
export function requireSnapshot(tree, label) {
  let listed;
  try {
    listed = git(['rev-list', '--objects', '--missing=print', tree], { env: storeEnv() });
  } catch (error) {
    // Such as a git too old for --missing=print, or a snapshot name that is no object.
    refuse(`${label} ${tree} could not be read from patch/objects or the repository:`, [error.message.trim()]);
  }
  const missing = listed.split('\n').filter((line) => line.startsWith('?')).map((line) => line.slice(1));
  // The snapshot's own tree is never a promisor's: a clean tree's snapshot is a commit's tree, which gc can prune.
  const promised = () => !missing.includes(tree)
    && spawnSync('git', ['rev-list', '--objects', '--missing=allow-promisor', tree], { cwd: root, env: storeEnv(), stdio: 'ignore' }).status === 0;
  if (missing.length && !promised()) refuse(`${label} ${tree} lacks objects that git gc pruned from the repository, which neither it nor patch/objects holds now:`, missing.slice(0, 5));
}

// On a file system that ignores case, git keeps a name's old case when only its case changes, so no patch carries
// such a rename: each path of the snapshot, or its first folder, whose spelling on disk differs only in case.
export function caseOnlyRenames(tree) {
  if (!ignoresCase()) return [];
  const name = process.platform === 'darwin' ? (text) => text.normalize('NFC') : (text) => text;
  const listings = new Map();
  const spelled = (dir, part) => {
    if (!listings.has(dir)) {
      let names = null;
      try {
        names = new Map(readdirSync(join(root, dir)).map((entry) => [name(entry).toLowerCase(), name(entry)]));
      } catch {
        // Not on disk, as a file a sparse checkout leaves out.
      }
      listings.set(dir, names);
    }
    return listings.get(dir)?.get(name(part).toLowerCase());
  };
  const renamed = new Set();
  for (const path of git(['ls-tree', '-r', '-z', '--name-only', '--full-tree', tree], { env: storeEnv() }).split('\0').filter(Boolean)) {
    const parts = path.split('/');
    for (let i = 0; i < parts.length; i += 1) {
      const found = spelled(parts.slice(0, i).join('/'), parts[i]);
      if (found === undefined) break;
      if (found !== name(parts[i])) {
        renamed.add(`${parts.slice(0, i + 1).join('/')} (on disk: ${found})`);
        break;
      }
    }
  }
  return [...renamed];
}

export const patchFile = (number) => join(patchDir, `${number}.patch`);
export const stateFile = (number) => join(patchDir, `${number}.state`);
export const beforeFile = (number) => join(patchDir, `${number}.before`);
// The names untracked at a before record, compressed, since a folder with files in it may hold thousands: kept until the
// after record, which no longer needs it.
export const untrackedFile = (number) => join(patchDir, `${number}.untracked`);
export function untrackedList(number) {
  try {
    const names = JSON.parse(gunzipSync(readFileSync(untrackedFile(number))).toString('utf8'));
    if (!Array.isArray(names)) throw new Error('it holds no list');
    return names;
  } catch (error) {
    refuse(`Fragment ${number}'s ${number}.untracked cannot be read (${error.message.split('\n')[0]}), so its before record is unusable: remove ${number}.before and ${number}.untracked, and run "node record.mjs ${number} before" again.`);
  }
}

// A fragment's record, or null before its after record. A record that cannot be read is refused by name, since
// nothing can tell what it recorded.
export function loadState(number) {
  const file = stateFile(number);
  if (!existsSync(file)) return null;
  let state;
  try {
    state = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    refuse(`Fragment ${number}'s record ${file} is not valid JSON: ${error.message.split('\n')[0]}`);
  }
  // Such as null, which would pass for a fragment with no record.
  if (typeof state?.files !== 'object' || state.files === null) refuse(`Fragment ${number}'s record ${file} is no fragment record: it lists no files.`);
  return state;
}

// The files that fragments before the given one, or all of them, adopted with --include: every snapshot captures them
// whatever version control ignores, and the fragments after theirs, which hold them already, keep doing so.
export const adoptedFiles = (before) => fragments().filter((number) => !before || number < before).flatMap((number) => loadState(number)?.included ?? []);

export const changesFiles = (number) => Object.keys(loadState(number)?.files ?? {}).length > 0;

// Every fragment with a record, also one that changes no file, which no position check reads, must have been recorded in
// this repository or worktree.
export function requireRoots() {
  for (const number of fragments()) {
    const state = loadState(number);
    if (state) requireRoot(state.root, `Fragment ${number}'s record`);
  }
}

// Fragments with a recorded patch that changes files, in order; fragments that change no file are passed over.
export const recorded = () => fragments().filter((number) => loadState(number) && changesFiles(number));

// The nested repositories the given fragments change, each with its fragment: apply and revert refuse them.
export const nestedRepos = (numbers) => numbers.flatMap((number) => gitlinks(loadState(number).files).map((line) => `${number} ${line}`));

// An open fragment, with a before record and no after record, would have its patch absorb what apply and revert write.
export function requireClosed(action) {
  const open = fragments().filter((number) => existsSync(beforeFile(number)) && !loadState(number));
  if (open.length) refuse(`Refusing to ${action}: fragment ${open.join(', ')} has a before record and no after record, and its patch would absorb what ${action} writes; record its after first, or remove its before record if the user drops it.`);
}

// The mode and object of each wanted path in a tree, as rawChanges gives them, or null where the path is absent.
function treeEntries(run, tree, paths) {
  const entries = treeMap(run, tree);
  return Object.fromEntries(paths.map((path) => [path, entries.get(path) ?? null]));
}

// The current mode and object of each path, from a transient snapshot of the working tree, which stores nothing: the
// tracked files, every fragment's adopted ones, and the other files read.
const currentEntries = (paths, read = []) => snapshotTree({ adopted: [...adoptedFiles(), ...read], transient: true, wanted: paths }).entries;

// How many of the given fragments are applied in order, or null with the files that fit no point of the sequence.
export function position(numbers) {
  const states = numbers.map(loadState);
  numbers.forEach((number, i) => requireRoot(states[i].root, `Fragment ${number}'s record`));
  const paths = [...new Set(states.flatMap((state) => Object.keys(state.files)))];
  // A recorded path with no entry where a file or link stands holds a file that nothing tracks or adopts, such as one
  // revert wrote back after git rm, git mv, or a commit took it out of the index; read like an adopted one, it counts
  // for what it holds instead of passing for a deleted file. One the index tracks in another spelling is that file,
  // which is no such file, and so is a path read through a link in one of its folders, one of the link's target.
  let current = currentEntries(paths);
  const read = outsideIndex(paths.filter((path) => current[path] === null));
  if (read.length) current = currentEntries(paths, read);
  const recordedState = (path) => states.some((state) => path in state.files && [state.files[path].before, state.files[path].after].includes(current[path]));
  const unseen = paths.filter((path) => current[path] === null && inRealFolders(path) && (onDisk(path)?.isFile() || onDisk(path)?.isSymbolicLink()));
  if (unseen.length) return { applied: null, mismatched: unseen };
  const fitting = (entries) => {
    for (let applied = numbers.length; applied >= 0; applied -= 1) {
      const matches = paths.every((path) => {
        const last = states.slice(0, applied).findLast((state) => path in state.files);
        const next = states.slice(applied).find((state) => path in state.files);
        return entries[path] === (last ? last.files[path].after : next.files[path].before);
      });
      if (matches) return applied;
    }
    return null;
  };
  // Where nothing fits what such a file holds, it is one the plan no longer has, such as a file a fragment removed with
  // git rm that a build or install wrote again, and it counts as absent: what apply or revert would write there, git
  // apply --check and obstructed refuse before anything is written.
  const applied = fitting(current) ?? (read.length ? fitting({ ...current, ...Object.fromEntries(read.map((path) => [path, null])) }) : null);
  if (applied !== null) return { applied, mismatched: [] };
  return { applied: null, mismatched: paths.filter((path) => !recordedState(path)) };
}

// Of the paths, those standing as files or links in real folders that the index tracks under no spelling and no
// fragment adopted, as after git rm, git mv, or a commit took them out of the index: no script writes the index, so
// they stay untracked.
export function outsideIndex(paths) {
  if (!paths.length) return [];
  const known = new Set([...git(['ls-files', '-z', '--cached']).split('\0'), ...adoptedFiles()].map(pathKey));
  return paths.filter((path) => !known.has(pathKey(path)) && inRealFolders(path) && (onDisk(path)?.isFile() || onDisk(path)?.isSymbolicLink()));
}

// Refuses, before any snapshot, the files of a snapshot that stay on disk while the index no longer tracks them, as
// after git rm --cached, git reset, or a commit that stops tracking them: no patch can carry taking a file out of the
// index, so that change waits until after closing, and the advice says what to do instead. A snapshot that cannot be
// read is refused where it is read.
export function requireIndexed(tree, subject, what, advice) {
  let paths;
  try {
    paths = git(['ls-tree', '-r', '-z', '--name-only', '--full-tree', tree], { env: storeEnv() }).split('\0').filter(Boolean);
  } catch {
    return;
  }
  const outside = outsideIndex(paths);
  if (outside.length) refuse(`${subject}: the index no longer tracks these files of ${what}, which stay on disk, and no patch can carry taking a file out of the index; ${advice}:`, outside);
}
// Refuses, before any snapshot, an index entry in a second spelling of a name, one the file system takes for the same
// file, where neither the snapshot the phase builds on, tree, nor the last commit holds it, as git update-index --add of
// NOTES.md beside a tracked notes.md makes on a file system that ignores case: no snapshot can tell which entry stands
// for the file on disk, and a patch that deletes either deletes the file. Spellings they hold already, as
// a history that tracks both A.h and a.h does, stay, and the keys of names the index or that snapshot holds in two
// spellings come back, since no patch can replay a change to such a file, a deletion of one spelling included.
export function requireOneSpelling(subject, tree, what) {
  const grouped = (paths) => {
    const spellings = new Map();
    for (const path of paths) spellings.set(pathKey(path), [...(spellings.get(pathKey(path)) ?? []), path]);
    return [...spellings.values()].filter((group) => group.length > 1);
  };
  const names = (snapshot) => {
    try {
      return snapshot ? git(['ls-tree', '-r', '-z', '--name-only', '--full-tree', snapshot], { env: storeEnv() }).split('\0').filter(Boolean) : [];
    } catch {
      return []; // A snapshot that cannot be read is refused where it is read; until then, it holds no spelling.
    }
  };
  // A path in conflict comes once per stage, which is no second spelling.
  const twice = grouped(new Set(git(['ls-files', '-z', '--cached']).split('\0').filter((name) => name && !inPlan(name))));
  const base = names(tree);
  const keys = new Set([...twice, ...grouped(base)].map((group) => pathKey(group[0])));
  if (!twice.length) return keys;
  const held = new Set([...base, ...names(git(['rev-parse', '--verify', '-q', 'HEAD^{tree}'], { none: true }).trim())]);
  // Where the snapshot holds no spelling of a name, one of them stays.
  const added = twice.flatMap((paths) => {
    const missing = paths.filter((path) => !held.has(path));
    return (missing.length === paths.length ? missing.slice(1) : missing).map((path) => `${path} (beside ${paths.filter((other) => other !== path).join(', ')})`);
  });
  const holders = tree ? `${what} and the last commit` : 'the last commit';
  if (added.length) refuse(`${subject}: the index holds these names in a second spelling that this file system takes for the same file, which ${holders} lack, so no snapshot can tell which one the file on disk is; take each out of the index with git rm --cached -- <file>, which leaves the file on disk:`, added);
  return keys;
}
// What to do about a change to a file the index or a snapshot holds in two spellings, which no patch can replay.
export const TWO_SPELLINGS = 'files the index or its before snapshot holds in two spellings that this file system takes for one file, which apply, revert, and restore cannot replay; undo the fragment\'s change to each, take out of the index with git rm --cached -- <file> a spelling the before snapshot lacks, and leave the change until after closing, once no fragment remains to run, by the user or through a commit the prompt authorizes then';
export const TRACK_AGAIN ='track each again with git add -- <file>, with -f for an ignored one, and leave taking it out of the index until after closing, once no fragment remains to run, by the user or through a commit the prompt authorizes then';

export function refuse(message, mismatched = []) {
  console.error([message, ...mismatched].join('\n  '));
  process.exit(1);
}
