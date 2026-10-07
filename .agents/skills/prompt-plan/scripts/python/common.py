"""Helpers shared by record.py, apply.py, and revert.py; paths resolve from this file."""

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
# A Windows pipe defaults to a legacy code page; print a character it lacks, as in a file name, as an escape.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, 'reconfigure'):
        _stream.reconfigure(errors='backslashreplace')

PATCH_DIR = Path(__file__).resolve().parent
PLAN_DIR = PATCH_DIR.parent
ROOT = Path(subprocess.run(
    ['git', 'rev-parse', '--show-toplevel'], cwd=PATCH_DIR, capture_output=True, text=True, check=True,
).stdout.strip())
PLAN_PATH = PLAN_DIR.relative_to(ROOT).as_posix()


def git(args, env=None, binary=False):
    """Runs git from the project root; returns stdout as text, or as bytes with binary=True."""
    result = subprocess.run(['git', *args], cwd=ROOT, capture_output=True, env=env)
    if result.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} exited with {result.returncode}:\n{result.stderr.decode(errors='replace')}")
    return result.stdout if binary else result.stdout.decode()


def fragments():
    """Fragment numbers in build/, in order, without the 00 index."""
    numbers = (re.match(r'^(\d{2})-.+\.md$', path.name) for path in (PLAN_DIR / 'build').iterdir())
    return sorted(match.group(1) for match in numbers if match and match.group(1) != '00')


def select_fragments(arg, allow_all=True):
    available = fragments()
    if arg == 'all' and allow_all:
        return available
    number = str(arg or '').zfill(2)
    if number not in available:
        usage = '<fragment number | all>' if allow_all else '<fragment number>'
        raise SystemExit(f"Usage: {usage}. Available fragments: {', '.join(available)}")
    return [number]


def snapshot_tree():
    """Captures the working tree as a git tree without touching the repository index: a temporary index,
    seeded from the real one so tracked files that match ignore patterns stay included, then updated from
    the working tree. The plan directory stays out: git already leaves it out when it is ignored, and naming
    an ignored path in an exclude pathspec would make git add fail."""
    index_file = PATCH_DIR / '.snapshot-index'
    real_index = Path(git(['rev-parse', '--git-path', 'index']).strip())
    real_index = real_index if real_index.is_absolute() else ROOT / real_index
    env = {**os.environ, 'GIT_INDEX_FILE': str(index_file)}
    try:
        if real_index.exists():
            # Keep the index's own timestamps: git compares entries against them to rehash files changed in
            # the same second as the index was written, and a fresh timestamp would hide such a change.
            shutil.copy2(real_index, index_file)
        ignored = subprocess.run(['git', 'check-ignore', '-q', PLAN_PATH], cwd=ROOT).returncode == 0
        git(['add', '-A', '--', '.', *([] if ignored else [f':(exclude){PLAN_PATH}'])], env=env)
        return git(['write-tree'], env=env).strip()
    finally:
        index_file.unlink(missing_ok=True)


def patch_file(number):
    return PATCH_DIR / f'{number}.patch'


def state_file(number):
    return PATCH_DIR / f'{number}.state'


def before_file(number):
    return PATCH_DIR / f'{number}.before'


def load_state(number):
    path = state_file(number)
    return json.loads(path.read_text()) if path.exists() else None


def changes_files(number):
    state = load_state(number)
    return bool(state and state['files'])


def current_hash(path):
    """Current hash of a file as git would store it, or None when it does not exist."""
    if not (ROOT / path).exists():
        return None
    return git(['hash-object', '--', path]).strip()


def recorded():
    """Fragments with a recorded patch that changes files, in order; fragments that change no file are passed over."""
    return [number for number in fragments() if changes_files(number)]


def position(numbers):
    """How many of the given fragments are applied in order, or None with the files that fit no point of the sequence."""
    states = [load_state(number) for number in numbers]
    paths = sorted({path for state in states for path in state['files']})
    current = {path: current_hash(path) for path in paths}
    for applied in range(len(numbers), -1, -1):
        def expected(path):
            last = next((state for state in reversed(states[:applied]) if path in state['files']), None)
            if last:
                return last['files'][path]['after']
            return next(state for state in states[applied:] if path in state['files'])['files'][path]['before']
        if all(current[path] == expected(path) for path in paths):
            return applied, []
    known = lambda path: any(
        path in state['files'] and current[path] in (state['files'][path]['before'], state['files'][path]['after'])
        for state in states
    )
    return None, [path for path in paths if not known(path)]


def refuse(message, mismatched=()):
    print('\n  '.join([message, *mismatched]), file=sys.stderr)
    raise SystemExit(1)
