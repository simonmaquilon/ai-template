"""Apply a fragment's patch, or every fragment in order: python3 apply.py <NN|all>
Writes only the paths each patch lists, passes over fragments that change no file, skips fragments
already applied, and refuses when the files fit no point of the fragment sequence or an earlier
fragment is missing.
"""

import sys

sys.dont_write_bytecode = True

from common import changes_files, git, load_state, patch_file, position, recorded, refuse, select_fragments  # noqa: E402

arg = sys.argv[1] if len(sys.argv) > 1 else None
(requested,) = select_fragments(arg)[:1] if arg != 'all' else (None,)
if arg != 'all' and not load_state(requested):
    refuse(f'Fragment {requested}: no recorded patch; it has not been executed yet.')
if arg != 'all' and not changes_files(requested):
    print(f'Fragment {requested}: changes no file; skipped.')
    raise SystemExit(0)
numbers = recorded()
applied, mismatched = position(numbers)
if applied is None:
    refuse('Refusing to apply: these files match no recorded fragment state:', mismatched or ['(a mix of states from different fragments)'])
target = len(numbers) if arg == 'all' else numbers.index(requested) + 1
if target <= applied:
    print(f'All {applied} fragment(s) that change files are already applied.' if arg == 'all' else f'Fragment {requested}: already applied.')
    raise SystemExit(0)
if arg != 'all' and target > applied + 1:
    refuse(f"Fragment {requested}: apply {', '.join(numbers[applied:target - 1])} first.")
for number in numbers[applied:target]:
    git(['apply', '--check', '--whitespace=nowarn', str(patch_file(number))])
    git(['apply', '--whitespace=nowarn', str(patch_file(number))])
    print(f'Fragment {number}: applied.')
