"""Revert a fragment's patch, or every fragment in reverse order: python3 revert.py <NN|all>
Writes only the paths each patch lists, passes over fragments that change no file, skips fragments
already reverted, and refuses when the files fit no point of the fragment sequence or a later fragment
is still applied. Commits made between fragments stay in history.
"""

import sys

sys.dont_write_bytecode = True

from common import changes_files, git, load_state, patch_file, position, recorded, refuse, select_fragments  # noqa: E402

arg = sys.argv[1] if len(sys.argv) > 1 else None
(requested,) = select_fragments(arg)[:1] if arg != 'all' else (None,)
if arg != 'all' and not load_state(requested):
    refuse(f'Fragment {requested}: no recorded patch; nothing to revert.')
if arg != 'all' and not changes_files(requested):
    print(f'Fragment {requested}: changes no file; skipped.')
    raise SystemExit(0)
numbers = recorded()
applied, mismatched = position(numbers)
if applied is None:
    refuse('Refusing to revert: these files match no recorded fragment state:', mismatched or ['(a mix of states from different fragments)'])
target = 0 if arg == 'all' else numbers.index(requested)
if applied <= target:
    print('No fragment that changes files is applied.' if arg == 'all' else f'Fragment {requested}: already reverted.')
    raise SystemExit(0)
if arg != 'all' and applied > target + 1:
    refuse(f"Fragment {requested}: revert {', '.join(reversed(numbers[target + 1:applied]))} first.")
for number in reversed(numbers[target:applied]):
    git(['apply', '-R', '--check', '--whitespace=nowarn', str(patch_file(number))])
    git(['apply', '-R', '--whitespace=nowarn', str(patch_file(number))])
    print(f'Fragment {number}: reverted.')
