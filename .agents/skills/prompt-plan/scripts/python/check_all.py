"""Runs, in order, the checks of every fragment up to the one given (or all): python3 all.py [NN]
Copied to check/all.py; exits non-zero when any check fails."""

import re
import subprocess
import sys
from pathlib import Path

CHECK_DIR = Path(__file__).resolve().parent
# Anything but a fragment number, such as --baseline, would compare as text and silently run no check.
if len(sys.argv) > 2 or (len(sys.argv) == 2 and not re.fullmatch(r'\d{1,2}', sys.argv[1])):
    print('Usage: python3 all.py [NN]. Run a single NN-check script directly for a --baseline run.', file=sys.stderr)
    sys.exit(2)
up_to = sys.argv[1].zfill(2) if len(sys.argv) > 1 else '99'
failed = False
for script in sorted(path for path in CHECK_DIR.iterdir() if re.match(r'^\d{2}-check\.py$', path.name) and path.name[:2] <= up_to):
    failed |= subprocess.run([sys.executable, '-B', str(script)]).returncode != 0
sys.exit(1 if failed else 0)
