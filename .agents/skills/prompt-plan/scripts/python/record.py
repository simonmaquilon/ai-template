"""Record a fragment while it is executed:
    python3 record.py <NN> before    before the fragment starts
    python3 record.py <NN> after     once its checks pass; writes NN.patch and NN.state
    python3 record.py <NN> restore   puts the working tree back to the `before` snapshot of a fragment
                                     that has no `after` yet, such as a failed one about to be retried
"""

import sys

sys.dont_write_bytecode = True

import json  # noqa: E402
import re  # noqa: E402

from common import before_file, git, patch_file, select_fragments, snapshot_tree, state_file  # noqa: E402

ZERO = re.compile(r'^0+$')

arg, phase = (sys.argv[1:] + [None, None])[:2]
(number,) = select_fragments(arg, allow_all=False)
before = before_file(number)


def before_tree():
    if not before.exists():
        raise SystemExit(f'Missing {number}.before: run "python3 record.py {number} before" first.')
    return before.read_text().strip()


if phase == 'before':
    before.write_text(f'{snapshot_tree()}\n')
    print(f'Fragment {number}: initial state recorded.')
elif phase == 'after':
    start = before_tree()
    end = snapshot_tree()
    files = {}
    # Each --raw entry carries the full hashes before and after for one path.
    fields = [field for field in git(['diff', '--raw', '-z', '--no-renames', '--no-abbrev', start, end]).split('\0') if field]
    for meta, path in zip(fields[0::2], fields[1::2]):
        _, _, old_hash, new_hash = meta.split(' ')[:4]
        files[path] = {'before': None if ZERO.match(old_hash) else old_hash, 'after': None if ZERO.match(new_hash) else new_hash}
    # The patch is written as bytes; a fragment that changes no file gets an empty patch and a state that lists no file.
    patch_file(number).write_bytes(git(['diff', '--binary', '--full-index', start, end], binary=True) if files else b'')
    state_file(number).write_text(json.dumps({'beforeTree': start, 'afterTree': end, 'files': files}, indent=2) + '\n')
    before.unlink()
    print(f'Fragment {number}: {len(files)} file(s) in {number}.patch and {number}.state.')
elif phase == 'restore':
    if state_file(number).exists():
        raise SystemExit(f'Fragment {number} is already recorded; use revert.py instead.')
    back = git(['diff', '--binary', '--full-index', snapshot_tree(), before_tree()], binary=True)
    if not back:
        print(f'Fragment {number}: the working tree already matches its initial state.')
    else:
        temp = patch_file(number).with_suffix('.restore')
        temp.write_bytes(back)
        try:
            git(['apply', '--check', '--whitespace=nowarn', str(temp)])
            git(['apply', '--whitespace=nowarn', str(temp)])
        finally:
            temp.unlink(missing_ok=True)
        print(f'Fragment {number}: working tree restored to its initial state.')
else:
    raise SystemExit('Usage: python3 record.py <NN> before|after|restore')
