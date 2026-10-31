// Applies a fragment's patch, or every fragment in order: node apply.mjs <NN|all>
// Writes only the paths each patch lists, passes over fragments that change no file, skips fragments
// already applied, and refuses when the files fit no point of the fragment sequence or an earlier
// fragment is missing, or a fragment to apply changes a nested repository, whose contents no patch carries, or finds
// something its patch does not remove where it must put a file, or a filter git runs on a file hides bytes the patch
// would overwrite, or any fragment is open, with a before record and no after record, whose patch would absorb what it
// writes, or any fragment's record, also one that changes no file, was taken in another repository or worktree. A patch
// that git fails to write after its check passed, or that leaves a file it deletes in place, may leave part of it in
// the working tree, which the refusal says. A recorded file the index no longer tracks counts for what it holds, or as
// absent where no point of the sequence fits otherwise, and git apply --check refuses to write over it. It refuses to
// run while core.ignorecase is false or unset on a file system that ignores case.
import {
  PARTIAL, PartialWrite, changesFiles, loadState, nestedRepos, obstructed, patchFile, position, recorded, refuse, requireClosed, requireRoots,
  requireCaseConfig, requireVisible, selectFragments, writePatch,
} from './common.mjs';

const arg = process.argv[2];
const [requested] = selectFragments(arg);
requireCaseConfig();
requireClosed('apply');
requireRoots();
if (arg !== 'all' && !loadState(requested)) refuse(`Fragment ${requested}: no recorded patch; it has not been executed yet.`);
if (arg !== 'all' && !changesFiles(requested)) {
  console.log(`Fragment ${requested}: changes no file; skipped.`);
  process.exit(0);
}
const numbers = recorded();
const { applied, mismatched } = position(numbers);
if (applied === null) refuse('Refusing to apply: these files match no recorded fragment state:', mismatched.length ? mismatched : ['(a mix of states from different fragments)']);
const target = arg === 'all' ? numbers.length : numbers.indexOf(requested) + 1;
if (target <= applied) {
  console.log(arg === 'all' ? `All ${applied} fragment(s) that change files are already applied.` : `Fragment ${requested}: already applied.`);
  process.exit(0);
}
if (arg !== 'all' && target > applied + 1) refuse(`Fragment ${requested}: apply ${numbers.slice(applied, target - 1).join(', ')} first.`);
const nested = nestedRepos(numbers.slice(applied, target));
if (nested.length) refuse("Refusing to apply: a patch cannot carry a nested repository's contents; set each by hand:", nested);
for (const number of numbers.slice(applied, target)) {
  // Snapshots hash through clean filters, so a file can match this fragment's before state although a filter hides bytes
  // that writing the patch would overwrite.
  const { files } = loadState(number);
  requireVisible(files, `Fragment ${number}`, 'applying it', ', so it and the fragments after it stay unapplied');
  const blocked = obstructed(files);
  if (blocked.length) refuse(`Fragment ${number}: something its patch does not remove stands where it must put these, so it and the fragments after it stay unapplied; move it aside first:`, blocked);
  try {
    writePatch(patchFile(number), files);
  } catch (error) {
    if (error instanceof PartialWrite) refuse(`Fragment ${number}: git failed while writing its patch, so ${PARTIAL}; inspect it before going on. Git's reason:`, [error.message.trim()]);
    refuse(`Fragment ${number}: its patch does not apply to the working tree, so it and the fragments after it stay unapplied:`, [error.message.trim()]);
  }
  console.log(`Fragment ${number}: applied.`);
}
