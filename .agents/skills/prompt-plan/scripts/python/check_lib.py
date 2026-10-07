"""Shared helpers for the plan's NN-check scripts; copied to check/lib.py.
Runs commands from the project root, stores each run in review/NN-check-<UTC stamp>.log, or in
review/NN-baseline-<UTC stamp>.log when the check runs with --baseline on the tree before the plan's
fragments, and exits non-zero on any failure. It writes only to review/ and, when a check isolates a tool,
the plan's .cache/.
Run NN-check scripts with `python3 -B`, as check/all.py does, so no bytecode is written."""

import os
import signal
import subprocess
import sys
import time
import urllib.request
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
# A Windows pipe defaults to a legacy code page; print a character it lacks as an escape instead of failing.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, 'reconfigure'):
        _stream.reconfigure(errors='backslashreplace')

CHECK_DIR = Path(__file__).resolve().parent
PLAN_DIR = CHECK_DIR.parent
REVIEW_DIR = PLAN_DIR / 'review'
CACHE_DIR = PLAN_DIR / '.cache'
_top = subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=CHECK_DIR, capture_output=True, text=True)
ROOT = Path(_top.stdout.strip()) if _top.returncode == 0 else Path.cwd()
IS_WINDOWS = os.name == 'nt'
RUN_KIND = 'baseline' if '--baseline' in sys.argv[1:] else 'check'


def utc_stamp():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S-%fZ')


def evidence_file(fragment, name, ext):
    """Path in review/ for a check's own evidence, such as a screenshot: NN-<name>-<UTC stamp>.<ext>, or
    NN-baseline-<name>-<UTC stamp>.<ext> on a --baseline run."""
    REVIEW_DIR.mkdir(exist_ok=True)
    prefix = 'baseline-' if RUN_KIND == 'baseline' else ''
    return REVIEW_DIR / f'{fragment}-{prefix}{name}-{utc_stamp()}.{ext}'


def tool_env(isolate_home=False):
    """Environment for project commands, left as the baseline measured it except for NO_COLOR and no bytecode.
    isolate_home moves HOME into the plan's .cache/ for tools the sandbox blocks in the real home directory."""
    env = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'NO_COLOR': '1'}
    if isolate_home:
        env['HOME'] = str(CACHE_DIR / 'home')
        (CACHE_DIR / 'home').mkdir(parents=True, exist_ok=True)
    return env


def command(check_id, label, args, isolate_home=False, report_pending=False):
    """A project command that must exit with status 0. report_pending=True runs it but reports PENDING,
    for a check that covers the recommended option of a decision still open."""
    return {'id': check_id, 'label': label, 'args': args, 'isolate_home': isolate_home, 'report_pending': report_pending}


def command_allowing(check_id, label, args, allowed, parse_failures, isolate_home=False, report_pending=False):
    """A test command whose only allowed failures are the named tests the prompt's measured baseline records
    as failing before the change; parse_failures(stdout) returns the failing test names."""
    return {**command(check_id, label, args, isolate_home, report_pending), 'allowed': allowed, 'parse_failures': parse_failures}


def condition(check_id, label, ok, detail=''):
    """A condition computed by the check script itself."""
    return {'id': check_id, 'label': label, 'ok': ok, 'detail': detail}


def pending(check_id, label):
    """A criterion that waits on a decision with no recommended option, a pending datum, or a person's judgment: reported, never run."""
    return {'id': check_id, 'label': label, 'pending': True}


def _evaluate(check):
    if check.get('pending'):
        return 'PENDING', 'Not run; see the fragment.'
    if 'ok' in check:
        return ('PASS' if check['ok'] else 'FAIL'), check['detail']
    line = f"$ {' '.join(check['args'])}"
    try:
        result = subprocess.run(check['args'], cwd=ROOT, capture_output=True, text=True, errors='replace', env=tool_env(check['isolate_home']))
    except OSError as error:
        return 'FAIL', f'{line}\ncould not run: {error}'
    detail = f'{line}\nexit status: {result.returncode}\n{result.stdout}{result.stderr}'
    passed = result.returncode == 0
    if 'allowed' in check:
        failing = check['parse_failures'](result.stdout)
        unexpected = [name for name in failing if name not in check['allowed']]
        # A runner that fails without reporting any test failure crashed: that is never an allowed failure.
        passed = not unexpected and (result.returncode == 0 or bool(failing))
        detail += f"\nfailing: {failing}; allowed: {check['allowed']}"
    if check['report_pending']:
        return 'PENDING', f"{detail}\nresult with the recommended option: {'pass' if passed else 'fail'}"
    return ('PASS' if passed else 'FAIL'), detail


def _stop(process):
    if process.poll() is not None:
        return
    if IS_WINDOWS:
        subprocess.run(['taskkill', '/T', '/F', '/PID', str(process.pid)], capture_output=True)
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


@contextmanager
def server(args, url, isolate_home=False):
    """Starts a server command, waits until url answers, yields url, and always stops the server and its
    children. Use a fixed port with the server's strict-port option, checked free beforehand: if the server
    exits before answering, the port was taken and the check fails instead of using someone else's server."""
    flags = {'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP} if IS_WINDOWS else {'start_new_session': True}
    process = subprocess.Popen(args, cwd=ROOT, env=tool_env(isolate_home), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **flags)
    try:
        for _ in range(75):
            if process.poll() is not None:
                raise SystemExit(f"{' '.join(args)} exited with {process.returncode} before answering at {url}.")
            try:
                with urllib.request.urlopen(url, timeout=1) as response:
                    if response.status < 400:
                        break
            except OSError:
                time.sleep(0.2)
        else:
            raise SystemExit(f"{' '.join(args)} did not answer at {url}.")
        yield url
    finally:
        _stop(process)


def run_checks(fragment, checks, extra_lines=()):
    lines = [f'Fragment {fragment} · {RUN_KIND} run · {datetime.now(timezone.utc).isoformat()} · {ROOT}', *extra_lines]
    failed = 0
    for check in checks:
        status, output = _evaluate(check)
        failed += status == 'FAIL'
        lines += ['', f"## {status} {check['id']}: {check['label']}", str(output).rstrip()]
        print(f"{status:<7} {check['id']}: {check['label']}")
    REVIEW_DIR.mkdir(exist_ok=True)
    log = REVIEW_DIR / f'{fragment}-{RUN_KIND}-{utc_stamp()}.log'
    log.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'Fragment {fragment}: {failed} failing. Evidence: {log.relative_to(ROOT)}')
    sys.exit(1 if failed else 0)
