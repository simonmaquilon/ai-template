// Reverts a fragment's patch, or every fragment in reverse order: node revert.mjs <NN|all>
// Writes only the paths each patch lists, passes over fragments that change no file, skips fragments
// already reverted, and refuses when the files fit no point of the fragment sequence or a later
// fragment is still applied or a fragment to revert changes a nested repository, whose contents no patch carries, or
// finds something its patch does not remove where it must put a file back, or a filter git runs on a file hides bytes
// the patch would overwrite, or any fragment is open, with a before record and no after record, whose patch would
// absorb what it writes, or any fragment's record, also one that changes no file, was taken in another repository or
// worktree. A patch that git fails to write after its check passed, or that leaves a file it deletes in place, may
// leave part of it in the working tree, which the refusal says. It lists the files it writes back that the index no
// longer tracks, as after git rm, git mv, or a commit, which stay untracked; such a file counts for what it holds, or
// as absent where no point of the sequence fits otherwise, and git apply --check refuses to write over it. It refuses
// to run while core.ignorecase is false or unset on a file system that ignores case.
// Commits made between fragments stay in history.
import {
  PARTIAL, PartialWrite, changesFiles, loadState, nestedRepos, obstructed, patchFile, position, recorded, refuse, requireClosed, requireRoots,
  outsideIndex, requireCaseConfig, requireVisible, reversed, selectFragments, writePatch,
} from './common.mjs';

const arg = process.argv[2];
const [requested] = selectFragments(arg);
requireCaseConfig();
requireClosed('revert');
requireRoots();
if (arg !== 'all' && !loadState(requested)) refuse(`Fragment ${requested}: no recorded patch; nothing to revert.`);
if (arg !== 'all' && !changesFiles(requested)) {
  console.log(`Fragment ${requested}: changes no file; skipped.`);
  process.exit(0);
}
const numbers = recorded();
const { applied, mismatched } = position(numbers);
if (applied === null) refuse('Refusing to revert: these files match no recorded fragment state:', mismatched.length ? mismatched : ['(a mix of states from different fragments)']);
const target = arg === 'all' ? 0 : numbers.indexOf(requested);
if (applied <= target) {
  console.log(arg === 'all' ? 'No fragment that changes files is applied.' : `Fragment ${requested}: already reverted.`);
  process.exit(0);
}
if (arg !== 'all' && applied > target + 1) refuse(`Fragment ${requested}: revert ${numbers.slice(target + 1, applied).reverse().join(', ')} first.`);
const nested = nestedRepos(numbers.slice(target, applied));
if (nested.length) refuse("Refusing to revert: a patch cannot carry a nested repository's contents; set each by hand:", nested);
for (const number of numbers.slice(target, applied).reverse()) {
  // Snapshots hash through clean filters, so a file can match this fragment's after state although a filter hides bytes
  // that writing the patch back would overwrite.
  const back = reversed(loadState(number).files);
  requireVisible(back, `Fragment ${number}`, 'reverting it', ', so it and the fragments before it stay applied');
  const blocked = obstructed(back);
  if (blocked.length) refuse(`Fragment ${number}: something its patch does not remove stands where reverting it must put these back, so it and the fragments before it stay applied; move it aside first:`, blocked);
  try {
    writePatch(patchFile(number), back, { reverse: true });
  } catch (error) {
    if (error instanceof PartialWrite) refuse(`Fragment ${number}: git failed while writing its patch back, so ${PARTIAL}; inspect it before going on. Git's reason:`, [error.message.trim()]);
    refuse(`Fragment ${number}: its patch does not revert from the working tree, so it and the fragments before it stay applied:`, [error.message.trim()]);
  }
  console.log(`Fragment ${number}: reverted.`);
  const untracked = outsideIndex(Object.keys(back).filter((path) => back[path].after && !back[path].after.startsWith('160000 ')));
  if (untracked.length) console.log([`Fragment ${number}: files written back that the index no longer tracks, as after git rm, git mv, or a commit, so they stay untracked; apply and revert count them by what they hold:`, ...untracked].join('\n  '));
}
