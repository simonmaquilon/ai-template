// Records a fragment while it is executed:
//   node record.mjs <NN> before    before the fragment starts; lists the untracked files that version control does not
//                                  ignore, which no patch carries and none can be adopted later
//   node record.mjs <NN> after [--include <path>]... [--leave <path>]...
//                                  once its checks pass; writes NN.patch and NN.state, and lists the files that
//                                  changed between the previous fragment's record and this fragment's before record;
//                                  each --include adopts a file or link the fragment created, so that this and every
//                                  later record captures it, never one the working tree held by that name before it;
//                                  each --leave keeps an untracked file or folder out of the patch on purpose, and every
//                                  new untracked file that version control does not ignore needs one or the other; it
//                                  lists the untracked files of the before record that are gone and that its snapshot
//                                  does not hold, and the files staged since that it held untracked, or that were created
//                                  inside a folder it held untracked whole, which no patch carries; where the file system
//                                  ignores case it refuses, before writing anything, a rename that only changes case made
//                                  with git mv, of a file or of a folder, which apply and revert cannot replay, and a name
//                                  it adds or deletes in another case than an earlier fragment's state records it
//   node record.mjs <NN> restore  puts the tracked and adopted files back to the `before` snapshot of a fragment
//                                  that has no `after` yet, such as a failed one about to be retried, lists the new
//                                  untracked and staged files, which it leaves in place, and the files it writes back
//                                  that the index no longer tracks, which stay untracked
//   Each phase refuses to run while core.ignorecase is false or unset on a file system that ignores case, and, before any
//   snapshot, an index entry in a second spelling of a name, one the file system takes
//   for the same file, that neither the snapshot it builds on nor the last commit holds, until git rm --cached takes it
//   out; and a file of that snapshot that stays on disk while the index no longer tracks it, which no patch can carry,
//   until git add tracks it again or, in after, the agent deletes one the fragment removed with git rm that a build or
//   install wrote again. after and restore also refuse a change to a file the index or the before snapshot holds in two
//   spellings, the deletion of one included, which no patch can replay.
import { existsSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  NAMES, PARTIAL, PATCH, PartialWrite, adoptedFiles, beforeFile, caseOnlyRenames, fragments, git, gitlinks, ignoresCase, inPlan, inRealFolders,
  loadState, nestedGit, newUntracked, obstructed, onDisk, outsideIndex, ownRepository, patchFile, pathKey, planPath, position, rawChanges, recorded,
  TRACK_AGAIN, TWO_SPELLINGS, refuse, requireCaseConfig, requireIndexed, requireOneSpelling, requireRoot, requireSnapshot, requireVisible, root, selectFragments, snapshotTree, stateFile, storeEnv, untrackedBefore, untrackedFile,
  untrackedList, untrackedNow, writePatch,
} from './common.mjs';

const USAGE = 'Usage: node record.mjs <NN> before|after|restore, where after alone takes --include <path> to adopt a file and --leave <path> to leave a file or folder out, each repeated per path';
const [arg, phase, ...options] = process.argv.slice(2);
const [number] = selectFragments(arg, { allowAll: false });
if (!['before', 'after', 'restore'].includes(phase)) refuse(USAGE);
requireCaseConfig();
if (options.length % 2 || options.some((option, i) => (i % 2 === 0 ? !['--include', '--leave'].includes(option) : !option)) || (options.length && phase !== 'after')) refuse(USAGE);
// Each path given as one from the repository's root, through its real folders, which must lie inside it, outside the
// plan and outside any .git folder, compared without case where the file system ignores it.
const foldCase = ignoresCase() ? (text) => text.toLowerCase() : (text) => text;
const resolved = (given) => {
  const absolute = resolve(process.cwd(), given);
  let folder;
  try {
    folder = realpathSync.native(dirname(absolute));
  } catch {
    folder = null;
  }
  // The name as the folder spells it on disk, so a name typed in another case or form names the same file.
  const spelled = (name) => foldCase(process.platform === 'darwin' ? name.normalize('NFC') : name);
  let entries = [];
  try {
    entries = folder ? readdirSync(folder) : [];
  } catch {
    // A file where the folder should be: the path names nothing, which the refusals below report.
  }
  const onDiskName = folder ? (entries.find((entry) => spelled(entry) === spelled(basename(absolute))) ?? basename(absolute)) : '';
  const native = folder ? relative(realpathSync.native(root), join(folder, onDiskName)) : '';
  const path = native.split(sep).join('/');
  const segments = foldCase(path).split('/');
  const plan = foldCase(planPath);
  const inside = native && !isAbsolute(native) && segments[0] !== '..' && !segments.includes('.git')
    && !(inPlan(planPath) && (foldCase(path) === plan || foldCase(path).startsWith(`${plan}/`)));
  const stat = inside ? onDisk(path) : null;
  return stat ? { path, stat } : null;
};
const given = (flag) => options.flatMap((option, i) => (i % 2 === 0 && option === flag ? [options[i + 1]] : []));
const include = given('--include').map((path) => {
  const found = resolved(path);
  if (!found?.stat.isFile() && !found?.stat.isSymbolicLink()) refuse(`--include ${path} names no file inside the repository, outside the plan and outside .git.`);
  // The name as git spells it, which on macOS is composed where the disk may keep it decomposed.
  return git(['ls-files', '-z', '--others', '--cached', '--', `:(literal)${found.path}`]).split('\0').find(Boolean) ?? found.path;
});
const leave = given('--leave').map((path) => {
  const found = resolved(path);
  if (!found) refuse(`--leave ${path} names no file or folder inside the repository, outside the plan and outside .git.`);
  return found.path;
});
const before = beforeFile(number);
// A later fragment's records build on this one's, so this one's before and after records are never taken again.
const later = fragments().filter((other) => other > number && (existsSync(beforeFile(other)) || loadState(other)));
if (later.length) refuse(`Fragment ${number} keeps its records and its working tree: fragments ${later.join(', ')} already have records that build on them.`);
// Fragments run in order, so none starts while an earlier one has a before record and no after record.
const open = fragments().filter((other) => other < number && existsSync(beforeFile(other)) && !loadState(other));
if (phase === 'before' && open.length) refuse(`Fragment ${number} cannot start while fragment ${open.join(', ')} has a before record and no after record; record its after first, or remove its before record if the user drops it.`);
const previous = fragments().filter((other) => other < number && loadState(other)).at(-1);
// NN.before holds the snapshot and, on its second line, the repository or worktree it was taken in; NN.untracked holds
// the names untracked then.
const beforeRecord = () => {
  if (!existsSync(before)) refuse(`Missing ${number}.before: run "node record.mjs ${number} before" first.`);
  const [tree, recordedRoot] = readFileSync(before, 'utf8').split('\n');
  requireRoot(recordedRoot, `Fragment ${number}'s before record`);
  return { tree: tree.trim(), untracked: untrackedList(number) };
};
const report = (heading, lines) => {
  if (lines.length) console.log([`Fragment ${number}: ${heading}:`, ...lines].join('\n  '));
};

// The files that changed between the last earlier record and this fragment's before record: a tracked or adopted file
// this fragment's work changed before that record shows here although no NN.state lists it.
function listChanged(from) {
  if (!previous) return;
  const between = `between fragment ${previous}'s after record and this fragment's before record`;
  try {
    const changed = git([...NAMES, loadState(previous).afterTree, from], { env: storeEnv() }).split('\0').filter(Boolean);
    if (changed.length) report(`files changed ${between}`, changed);
    else console.log(`Fragment ${number}: no file changed ${between}.`);
  } catch (error) {
    console.error(`Fragment ${number} is recorded, but the files changed ${between} could not be listed:\n${error.message}`);
    process.exitCode = 1;
  }
}

// The nested repositories of a snapshot with work of their own not committed, which no patch carries either.
// Only a folder that is a repository of its own counts, and status runs without the optional locks that would rewrite
// any index.
const dirtyNested = (tree) => git(['ls-tree', '-r', '-z', '--full-tree', tree], { env: storeEnv() }).split('\0')
  .filter((record) => record.startsWith('160000 '))
  .map((record) => record.slice(record.indexOf('\t') + 1))
  .filter((path) => onDisk(path)?.isDirectory() && ownRepository(join(root, path))
    && nestedGit(join(root, path), ['--no-optional-locks', 'status', '--porcelain']).stdout?.trim());

if (phase === 'before') {
  // Done fragments are append-only: later records build on this one's, so it is never recorded again.
  if (existsSync(stateFile(number))) refuse(`Fragment ${number} is already recorded; a recorded fragment is never recorded again, and revert.mjs undoes it.`);
  // A fragment resumed or retried keeps the before record it already ran.
  if (existsSync(before)) refuse(`Fragment ${number} already has its before record; a fragment resumed or retried keeps it, and record ${number} restore returns to it.`);
  if (previous) requireRoot(loadState(previous).root, `Fragment ${previous}'s record`);
  // This record builds on every earlier recorded fragment, so all of them are applied.
  const prior = recorded().filter((other) => other < number);
  requireOneSpelling(`Fragment ${number} cannot start`, previous && loadState(previous).afterTree, previous ? `fragment ${previous}'s after record` : '');
  if (previous) requireIndexed(loadState(previous).afterTree, `Fragment ${number} cannot start`, `fragment ${previous}'s after record`, TRACK_AGAIN);
  const { applied, mismatched } = prior.length ? position(prior) : { applied: 0 };
  if (applied === null) refuse(`Fragment ${number} cannot start: these files match no recorded fragment state:`, mismatched.length ? mismatched : ['(a mix of states from different fragments)']);
  if (applied < prior.length) refuse(`Fragment ${number} cannot start until the fragments recorded before it are applied: run apply ${prior.slice(applied).join(', ')} first.`);
  const { tree } = snapshotTree({ adopted: adoptedFiles(number) });
  writeFileSync(untrackedFile(number), gzipSync(JSON.stringify(untrackedNow())));
  writeFileSync(before, `${tree}\n${root}\n`);
  console.log(`Fragment ${number}: initial state recorded.`);
  // Files earlier fragments adopted are carried by their patches, so they are no part of this listing.
  const adoptedKeys = new Set(adoptedFiles(number).map(pathKey));
  report('untracked files that version control does not ignore, which no patch carries and which cannot be adopted later', newUntracked((path) => adoptedKeys.has(pathKey(path))));
} else if (phase === 'after') {
  const { tree: from, untracked } = beforeRecord();
  const twoSpellings = requireOneSpelling(`Refusing to record fragment ${number}`, from, 'its before snapshot');
  requireIndexed(from, `Refusing to record fragment ${number}`, 'its before snapshot',
    `${TRACK_AGAIN}; delete instead each one the fragment removed with git rm, from the index and the disk, that a build or install wrote again, never one taken out of the index alone`);
  const wasUntracked = untrackedBefore(untracked);
  // A file the working tree held by that name before this fragment is no change a patch can carry: version control
  // tracks it when a commit adds it, and --include adopts only a file the fragment created. The before snapshot names
  // every tracked and adopted one, the untracked list every other.
  const inBefore = () => {
    try {
      return git(['ls-tree', '-r', '-z', '--name-only', '--full-tree', from], { env: storeEnv() }).split('\0').filter(Boolean);
    } catch {
      return []; // requireSnapshot below reports a before snapshot it cannot read.
    }
  };
  // Read once, when a check needs it.
  let treePaths;
  const treeList = () => (treePaths = treePaths ?? inBefore());
  let treeNames;
  const inTree = (path) => {
    treeNames = treeNames ?? new Set(treeList().map(pathKey));
    return treeNames.has(pathKey(path));
  };
  const held = include.filter((path) => inTree(path) || wasUntracked(path));
  if (held.length) {
    // How each name was held: by name, as the before snapshot or the untracked list spells it; by a spelling that differs
    // from the snapshot's only in case, which git does not record as a rename; or, if neither, inside a folder that the
    // list names as one.
    const composed = (path) => (process.platform === 'darwin' ? path.normalize('NFC') : path);
    const spelled = new Set([...treeList(), ...untracked].map(composed));
    const listed = untrackedBefore(untracked.filter((name) => !name.endsWith('/')));
    const byName = held.filter((path) => spelled.has(composed(path)) || (!inTree(path) && listed(path)));
    const byCase = held.filter((path) => !byName.includes(path) && inTree(path));
    const groups = [
      ['--include names files the working tree held by that name before this fragment, which no patch carries, so leave them as they are; only a commit the prompt authorizes can start tracking one:', byName],
      [`--include names files inside a folder that ${number}.untracked lists as one name, which stands for every file in it, new ones too, so no patch can carry them:`,
        held.filter((path) => !byName.includes(path) && !byCase.includes(path))],
      ['--include names files that differ from a path of the before snapshot only in case, which git does not record as a rename on this file system, so no patch can carry them:', byCase],
    ].filter(([, names]) => names.length);
    refuse(groups.map(([message, names]) => [message, ...names].join('\n  ')).join('\n'));
  }
  // A file or link the index tracks, or an earlier fragment adopted, has its change in the patch whatever --leave says,
  // except a tracked one that the working tree held untracked at the before record, which the snapshot leaves out; a
  // folder may hold both kinds.
  const adoptedBefore = new Set(leave.length ? adoptedFiles(number).map(pathKey) : []);
  const indexed = new Set(leave.length ? git(['ls-files', '-z', '--cached', '--', ...leave.map((path) => `:(literal)${path}`)]).split('\0').map(pathKey) : []);
  const carried = leave.filter((path) => !onDisk(path)?.isDirectory() && (adoptedBefore.has(pathKey(path)) || (indexed.has(pathKey(path)) && !wasUntracked(path))));
  if (carried.length) refuse('--leave names files the index tracks or an earlier fragment adopted, whose change the patch carries; it covers only untracked files and folders:', carried);
  // Each new untracked file that version control does not ignore is adopted or left, so none slips out of the patch by
  // oversight; a file in a folder version control ignored whole then counts as held, and a left folder covers the files
  // below it.
  const adoptedKeys = new Set(include.map(pathKey));
  const covered = (path) => {
    const key = pathKey(path.replace(/\/$/, ''));
    return adoptedKeys.has(key) || leave.some((left) => key === pathKey(left) || key.startsWith(`${pathKey(left)}/`));
  };
  // An earlier fragment's adopted file is in every snapshot whatever the index says, so one unstaged since is no new file.
  const adoptedEarlier = new Set(adoptedFiles(number).map(pathKey));
  const uncovered = newUntracked((path) => wasUntracked(path) || adoptedEarlier.has(pathKey(path))).filter((path) => !covered(path));
  if (uncovered.length) refuse(`Fragment ${number} has untracked files that version control does not ignore and the before record did not hold; adopt each one its work needs with --include <file>, and cover the rest with --leave <path>, a file or a folder:`, uncovered);
  requireSnapshot(from, `Fragment ${number}'s before snapshot`);
  // Where the file system ignores case, git apply never renames a file or folder on disk, so a rename that only changes
  // case, such as git mv notes.md NOTES.md or git mv of each file of a folder, shows as a deletion and an addition of
  // names that are one, which apply and revert could not tell applied from reverted: it is refused before anything is
  // written. A plain mv leaves the index as it was, so it makes no such pair and caseOnlyRenames reports it below. A name
  // this fragment adds or deletes in another case than an earlier fragment's state records it is such a pair across
  // fragments, since the index keeps the spelling it had, so the earlier fragment's name and this one's stand for one file.
  const refuseCasePairs = (files) => {
    const added = new Map();
    for (const path of Object.keys(files).filter((name) => files[name].before === null)) added.set(pathKey(path), [...(added.get(pathKey(path)) ?? []), path]);
    const spellings = new Map();
    for (const other of fragments().filter((fragment) => fragment < number)) {
      for (const path of Object.keys(loadState(other)?.files ?? {})) spellings.set(pathKey(path), [...(spellings.get(pathKey(path)) ?? []), [other, path]]);
    }
    const within = Object.keys(files).filter((name) => files[name].after === null)
      .flatMap((gone) => (added.get(pathKey(gone)) ?? []).map((path) => `${gone} -> ${path}`));
    const across = Object.keys(files).filter((name) => (files[name].before === null) !== (files[name].after === null))
      .flatMap((path) => (spellings.get(pathKey(path)) ?? []).filter(([, earlier]) => earlier !== path).map(([other, earlier]) => `earlier fragment ${other}: ${earlier} -> ${path}`));
    if (within.length || across.length) {
      // The advice follows the pairs it refers to. A rename within the fragment is undone by moving the file back and
      // then belongs to the user, outside every patch; a pair across fragments is no rename to move back, since the
      // earlier fragment's record holds the other spelling. Every pair, of either kind, is reported as outside every
      // patch, which is said once for all of them. The warning sign is escaped, as its emoji form holds an invisible
      // variation selector.
      const undo = "undo the rename by moving the file back to the old spelling, for example with git mv, record again, and make the rename after closing, once no fragment remains to run, by the user or through a commit the prompt authorizes then";
      const spell = "write the file under the spelling the earlier fragment recorded, or leave the rename until after closing, once no fragment remains to run, by the user or through a commit the prompt authorizes then";
      const advice = within.length && across.length ? `for a pair that names no earlier fragment, ${undo}; for a pair that names one, ${spell}` : within.length ? undo : spell;
      refuse(`Refusing to record fragment ${number}: a rename that only changes case, of a file or of a folder, cannot be recorded on this file system, since apply and revert cannot replay it. Renamed only in case:\n  ${[...within, ...across].join('\n  ')}\nTo record it, ${advice}. Report every pair above as \u26a0\ufe0f outside every patch.`);
    }
  };
  const snapshot = { base: from, adopted: [...adoptedFiles(number), ...include], untracked };
  // Both entries of a file the index or the before snapshot holds in two spellings read the one file on disk, so a change
  // shows twice, and apply and revert would write the file twice over, or find it deleted under one spelling only.
  const refuseDoubled = (changes) => {
    const doubled = Object.keys(changes).filter((path) => twoSpellings.has(pathKey(path)));
    if (doubled.length) refuse(`Refusing to record fragment ${number}: it changed ${TWO_SPELLINGS}:`, doubled);
  };
  // Both checks run first on a snapshot that stores nothing, so a refusal leaves in patch/objects no object of a file it
  // read, such as one --include named, and then on the recorded one, which a file changed meanwhile could set apart.
  const checks = (changes) => {
    if (ignoresCase()) refuseCasePairs(changes);
    refuseDoubled(changes);
  };
  if (ignoresCase() || twoSpellings.size) checks(snapshotTree({ ...snapshot, transient: true, changesFrom: from }).changes);
  const { tree: to, staged } = snapshotTree(snapshot);
  const files = rawChanges(from, to);
  checks(files);
  // The patch is written as bytes; a fragment that changes no file gets an empty patch and a state that lists no file.
  writeFileSync(patchFile(number), Object.keys(files).length ? git([...PATCH, from, to], { binary: true, env: storeEnv() }) : Buffer.alloc(0));
  writeFileSync(stateFile(number), `${JSON.stringify({ root, beforeTree: from, afterTree: to, files, included: include, left: leave }, null, 2)}\n`);
  rmSync(before);
  rmSync(untrackedFile(number));
  console.log(`Fragment ${number}: ${Object.keys(files).length} file(s) in ${number}.patch and ${number}.state.`);
  report('nested repositories, whose contents no patch carries, so apply and revert refuse them', gitlinks(files));
  report('nested repositories with uncommitted work of their own, which no patch carries', dirtyNested(to));
  report('renamed only in case, which git does not record on this file system, so no patch carries the new names', caseOnlyRenames(to));
  report('files staged since its before record that the working tree held untracked then, or created inside a folder it held untracked whole, which no patch carries', staged);
  // A folder entry stands for files never listed one by one, so only the names that are files come. The before snapshot
  // holds an adopted file, so the patch records its deletion and revert brings it back. A name under a link reads another file, one of the link's target, so it is no file of the working tree and is gone.
  report('files untracked at the before record that are gone now, which no patch carries, so revert cannot bring them back',
    untracked.filter((name) => !name.endsWith('/') && !(inRealFolders(name) && onDisk(name)) && !inTree(name)).sort());
  listChanged(from);
} else if (phase === 'restore') {
  if (existsSync(stateFile(number))) refuse(`Fragment ${number} is already recorded; use revert.mjs instead.`);
  const { tree: initial, untracked } = beforeRecord();
  const twoSpellings = requireOneSpelling(`Refusing to restore fragment ${number}`, initial, 'its before snapshot');
  requireIndexed(initial, `Refusing to restore fragment ${number}`, 'its before snapshot',
    'track each again with git add -- <file>, with -f for an ignored one, after keeping a copy of any that holds work that is not the fragment\'s, since the restore then writes the before snapshot\'s contents over it');
  // A file staged during the fragment is as much left in place as an untracked one, since a restore writes nothing to it.
  const { tree: now, added, staged } = snapshotTree({ base: initial, adopted: adoptedFiles(number), untracked, leaveNew: true });
  requireSnapshot(initial, `Fragment ${number}'s before snapshot`);
  const changes = rawChanges(now, initial);
  // Both entries of such a file read the one file on disk, so the way back would write it twice over.
  const doubled = Object.keys(changes).filter((path) => twoSpellings.has(pathKey(path)));
  if (doubled.length) refuse(`Refusing to restore fragment ${number}: its way back changes ${TWO_SPELLINGS}:`, doubled);
  const nested = gitlinks(changes);
  if (nested.length) refuse(`Refusing to restore fragment ${number}: a patch cannot carry a nested repository's contents; set each by hand:`, nested);
  // Snapshots hash through clean filters, so a file can match the state restored from although a filter hides bytes that
  // the restore would overwrite.
  requireVisible(changes, `Refusing to restore fragment ${number}`, 'a restore');
  // Something the restore does not remove where it must put a file back would make git apply fail halfway, so it is
  // refused before anything is written.
  const blockedPaths = obstructed(changes);
  if (blockedPaths.length) refuse(`Refusing to restore fragment ${number}: something stands where it must put these back; move it aside first:`, blockedPaths);
  const back = git([...PATCH, now, initial], { binary: true, env: storeEnv() });
  if (back.length === 0) {
    console.log(`Fragment ${number}: the working tree already matches its initial state.`);
  } else {
    const temp = `${patchFile(number)}.restore`;
    writeFileSync(temp, back);
    let failure;
    try {
      writePatch(temp, changes);
    } catch (error) {
      failure = error;
    } finally {
      rmSync(temp, { force: true });
    }
    if (failure instanceof PartialWrite) refuse(`Fragment ${number}'s restore failed while git wrote its patch back, so ${PARTIAL}; inspect it before going on. Git's reason:`, [failure.message.trim()]);
    if (failure) refuse(`Refusing to restore fragment ${number}: its patch back does not apply to the working tree:`, [failure.message.trim()]);
    console.log(`Fragment ${number}: working tree restored to its initial state.`);
  }
  // No restore touches an untracked or staged new file, so what the fragment wrote there stays until the agent deletes it.
  // A file the initial snapshot holds is no new one, though the index no longer tracks it once the restore wrote it back.
  const initialPaths = git(['ls-tree', '-r', '-z', '--name-only', '--full-tree', initial], { env: storeEnv() }).split('\0').filter(Boolean);
  const initialKeys = new Set(initialPaths.map(pathKey));
  // No script writes the index, so the advice names the git command that undoes what the fragment staged.
  report('files created since its before record, untracked or staged, left in place; delete the ones the fragment wrote, and unstage with git rm --cached -- <file> those it staged',
    [...newUntracked(untrackedBefore(untracked)).filter((path) => !initialKeys.has(pathKey(path))), ...added]);
  const byName = new Set(untracked.filter((name) => !name.endsWith('/')).map(pathKey));
  report('files staged since its before record inside a folder it held untracked whole, which may be new, left in place; delete the ones the fragment wrote, and unstage with git rm --cached -- <file> those it staged',
    staged.filter((path) => !byName.has(pathKey(path))));
  report('files staged since its before record that the working tree held untracked by that name then, left as they are, since no snapshot reads them; unstage each with git rm --cached -- <file>, and put back by hand any the fragment changed',
    staged.filter((path) => byName.has(pathKey(path))));
  // A file of the initial snapshot that stood out of the index was refused before the restore, so each one here is a
  // file it wrote back where git rm or git mv had taken it out of the index and off the disk.
  report('files written back that the index no longer tracks, as after git rm or git mv during the fragment, so they stay untracked; track each again with git add -- <file>, with -f for an ignored one',
    outsideIndex(initialPaths));
}
