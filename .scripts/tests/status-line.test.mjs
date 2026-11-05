import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import test from 'node:test';
import { branchOf, render } from '../status-line.mjs';
import { ROOT, WINDOWS, makeRepo, run, startRepo } from './support.mjs';

const NOW = Date.UTC(2026, 10, 5, 12, 0, 0);
const at = (seconds) => NOW / 1000 + seconds;
// A payload in the directory /x/proj on top of the given fields, rendered at NOW.
const line = (fields, branch = null) => render({ workspace: { current_dir: '/x/proj' }, ...fields }, { now: NOW, branch });
const cache = (fields) => line({ prompt_cache: { caching_observed: true, ...fields } });
const limit = (resetsIn) => line({ rate_limits: { five_hour: { used_percentage: 52, resets_at: at(resetsIn) } } });

test('a full payload renders every segment in order', () => {
  const input = {
    workspace: { current_dir: '/x/ai-template' },
    model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' },
    effort: { level: 'xhigh' },
    context_window: { used_percentage: 74.6 },
    prompt_cache: { warm: true, caching_observed: true, expires_at: at(58.5 * 60) },
    rate_limits: { five_hour: { used_percentage: 52, resets_at: at(2 * 3600 + 10 * 60 + 30) } },
  };
  assert.equal(render(input, { now: NOW, branch: 'main' }), 'ai-template [main] | opus 5.5 | xhigh | cx 75% | cc 58min | 52% 2h10m');
});

test('segments without data are omitted and leave no separator', () => {
  const absent = [{}, { model: null }, { model: { id: '', display_name: '' } }, { effort: {} }, { context_window: { used_percentage: null } },
    { prompt_cache: { warm: true, caching_observed: false, expires_at: at(600) } }, { rate_limits: {} },
    { rate_limits: { seven_day: { used_percentage: 3 } } }, { rate_limits: { five_hour: { used_percentage: null, resets_at: at(60) } } }];
  for (const input of absent) assert.equal(line(input), 'proj', JSON.stringify(input));
  const partial = { model: { id: 'claude-opus-5-5' }, context_window: { used_percentage: null }, rate_limits: { five_hour: { used_percentage: 40 } } };
  assert.equal(line(partial), 'proj | opus 5.5 | 40%');
  assert.equal(line({ context_window: { used_percentage: 0 }, rate_limits: { five_hour: { used_percentage: 0, resets_at: at(0) } } }), 'proj | cx 0% | 0% 0m');
});

test('the folder is the last path component of the directory, and the branch follows in brackets', () => {
  const folders = [['/x/ai-template', 'ai-template'], ['/x/proj/', 'proj'], ['C:\\Users\\me\\proj', 'proj'], ['C:\\Users\\me\\proj\\', 'proj'], ['/x/a b//', 'a b']];
  for (const [dir, folder] of folders) assert.equal(render({ workspace: { current_dir: dir } }, { now: NOW, branch: null }), folder);
  assert.equal(line({}, 'feature/x'), 'proj [feature/x]');
  assert.equal(render({ workspace: { current_dir: '/x/a' }, cwd: '/x/b' }, { now: NOW, branch: null }), 'a');
  assert.equal(render({ cwd: '/x/b' }, { now: NOW, branch: null }), 'b');
  assert.equal(render({}, { now: NOW, branch: null }), basename(process.cwd()));
});

test('the model is the family and version of its id, or its lowercased display name', () => {
  const models = [['claude-opus-5-5', 'opus 5.5'], ['claude-fable-5-1', 'fable 5.1'], ['claude-haiku-4-5-20251001', 'haiku 4.5'],
    ['claude-sonnet-4-20250514', 'sonnet 4'], ['claude-opus-5-5[1m]', 'opus 5.5'], ['us.anthropic.claude-opus-5-5-v1:0', 'opus 5.5']];
  for (const [id, expected] of models) assert.equal(line({ model: { id, display_name: 'Ignored' } }), `proj | ${expected}`, id);
  assert.equal(line({ model: { id: 'custom-model', display_name: 'Custom Model' } }), 'proj | custom model');
  assert.equal(line({ model: { display_name: 'Custom Model' } }), 'proj | custom model');
  assert.equal(line({ model: { id: 'custom-model' } }), 'proj');
});

test('the cache shows the whole minutes it stays warm, and 0min when cold, expired or without an expiry', () => {
  assert.equal(cache({ warm: true, expires_at: at(58.5 * 60) }), 'proj | cc 58min');
  assert.equal(cache({ warm: true, expires_at: at(300) }), 'proj | cc 5min');
  assert.equal(cache({ warm: false, expires_at: at(600) }), 'proj | cc 0min');
  assert.equal(cache({ warm: true, expires_at: null }), 'proj | cc 0min');
  assert.equal(cache({ warm: true, expires_at: at(-90) }), 'proj | cc 0min');
  assert.equal(line({ prompt_cache: { warm: true, expires_at: at(300) } }), 'proj | cc 5min');
});

test('the five-hour limit shows its percentage and the time left to its reset', () => {
  const left = [[2 * 3600 + 10 * 60 + 30, '2h10m'], [2 * 3600 + 5 * 60, '2h05m'], [3600, '1h00m'], [10 * 3600, '10h00m'], [45 * 60, '45m'],
    [30, '0m'], [-60, '0m']];
  for (const [seconds, expected] of left) assert.equal(limit(seconds), `proj | 52% ${expected}`, `${seconds}s`);
  assert.equal(line({ rate_limits: { five_hour: { used_percentage: 51.6 } } }), 'proj | 52%');
});

const status = (repo, input) => repo.script('status-line.mjs', [], typeof input === 'string' ? input : JSON.stringify(input));
function assertLine(result, expected) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${expected}\n`);
}

test('inside a repository the folder of the directory is followed by its branch', (t) => {
  const repo = startRepo(t);
  assert.equal(repo.git('checkout', '-q', '-b', 'feature').status, 0);
  repo.write('sub/inner.txt', 'inner\n');
  const model = { id: 'claude-opus-5-5' };
  assertLine(status(repo, { workspace: { current_dir: repo.dir }, model }), `${basename(repo.dir)} [feature] | opus 5.5`);
  assertLine(status(repo, { workspace: { current_dir: join(repo.dir, 'sub') } }), 'sub [feature]');
  assert.equal(branchOf(repo.dir), 'feature');
});

test('a detached HEAD shows the short commit id', (t) => {
  const repo = startRepo(t);
  assert.equal(repo.git('checkout', '-q', '--detach').status, 0);
  const sha = repo.git('rev-parse', '--short', 'HEAD').stdout.trim();
  assertLine(status(repo, { workspace: { current_dir: repo.dir } }), `${basename(repo.dir)} [${sha}]`);
  assert.equal(branchOf(repo.dir), sha);
});

test('outside a repository, or in a directory that does not exist, there are no brackets', (t) => {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.temp', 'status-line-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  const result = run(process.execPath, [join(ROOT, '.scripts', 'status-line.mjs')], { input: JSON.stringify({ workspace: { current_dir: dir } }) });
  assertLine(result, basename(dir));
  assert.equal(branchOf(dir), null);
  assert.equal(branchOf(join(dir, 'missing')), null);
});

test('input that is empty, malformed or not an object still prints the working folder and exits 0', (t) => {
  const repo = makeRepo(t);
  for (const input of ['', 'not json', 'null', '[]']) {
    const result = status(repo, input);
    assert.equal(result.status, 0, input);
    assert.ok(result.stdout.startsWith(basename(repo.dir)), `${input}: ${result.stdout}`);
  }
});

function registered() {
  const { statusLine } = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'));
  assert.ok(statusLine, '.claude/settings.json registers no statusLine');
  return statusLine;
}

test('Claude Code settings register the status line script, refreshed every minute', () => {
  const { type, command, refreshInterval } = registered();
  assert.equal(type, 'command');
  assert.equal(command, 'node "${CLAUDE_PROJECT_DIR}/.scripts/status-line.mjs"');
  assert.equal(refreshInterval, 60);
});

test('the registered command runs from any directory through a POSIX shell', { skip: WINDOWS && 'sh is not guaranteed on Windows, where the client runs the command through Git Bash or PowerShell' }, () => {
  const result = run('sh', ['-c', registered().command], {
    cwd: join(ROOT, '.scripts'),
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
    input: JSON.stringify({ workspace: { current_dir: ROOT } }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.startsWith(basename(ROOT)), result.stdout);
});
