// Applies a fragment's patch, or every fragment in order: node apply.mjs <NN|all>
// Writes only the paths each patch lists, passes over fragments that change no file, skips fragments
// already applied, and refuses when the files fit no point of the fragment sequence or an earlier
// fragment is missing.
import { changesFiles, git, loadState, patchFile, position, recorded, refuse, selectFragments } from './common.mjs';

const arg = process.argv[2];
const [requested] = selectFragments(arg);
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
for (const number of numbers.slice(applied, target)) {
  git(['apply', '--check', '--whitespace=nowarn', patchFile(number)]);
  git(['apply', '--whitespace=nowarn', patchFile(number)]);
  console.log(`Fragment ${number}: applied.`);
}
