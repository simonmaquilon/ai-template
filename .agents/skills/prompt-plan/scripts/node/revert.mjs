// Reverts a fragment's patch, or every fragment in reverse order: node revert.mjs <NN|all>
// Writes only the paths each patch lists, passes over fragments that change no file, skips fragments
// already reverted, and refuses when the files fit no point of the fragment sequence or a later
// fragment is still applied. Commits made between fragments stay in history.
import { changesFiles, git, loadState, patchFile, position, recorded, refuse, selectFragments } from './common.mjs';

const arg = process.argv[2];
const [requested] = selectFragments(arg);
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
for (const number of numbers.slice(target, applied).reverse()) {
  git(['apply', '-R', '--check', '--whitespace=nowarn', patchFile(number)]);
  git(['apply', '-R', '--whitespace=nowarn', patchFile(number)]);
  console.log(`Fragment ${number}: reverted.`);
}
