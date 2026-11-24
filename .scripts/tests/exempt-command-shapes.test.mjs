// Two shapes that the client keeps sandboxed and that the text of a call can show: a command name taken from a variable
// that the same call assigns a literal, and a git clone, init, worktree add or move, or bundle create whose path is
// absolute, starts with ~ or has a .. segment.

import assert from 'node:assert/strict';
import test from 'node:test';
import { splitCommand } from '../exempt-command.mjs';
import { scratch } from './scratch-fixture.mjs';

const split = (text) => {
  const { segments, forms } = splitCommand(text);
  return { segments, forms: [...forms] };
};
const FILES = ['check-exempt-command.mjs', 'exempt-command.mjs', 'exempt-match.mjs', 'exempt-shapes.mjs', 'shell-spans.mjs', 'hook-support.mjs'];

test('a command name taken from a variable assigned a literal in the same call is read as that command', () => {
  for (const [text, segment] of [
    ['A=docker; $A ps', 'docker ps'],
    ['A=docker\n"$A" ps', 'docker ps'],
    ['A=docker && ${A} ps', 'docker ps'],
    ['export A=docker; $A ps', 'docker ps'],
    ["A='docker'; $A ps", 'docker ps'],
    ['A=x; A=docker; $A ps', 'docker ps'],
    ['A="docker compose"; $A up', 'docker compose up'],
    ['if true; then A=docker; $A ps; fi', 'docker ps'],
  ]) {
    const result = split(text);
    assert.ok(result.segments.includes(segment), `${text}: ${result.segments}`);
    assert.ok(result.forms.includes('variable'), `${text}: ${result.forms}`);
  }
});

test('a variable that the call does not assign a literal, or that is not the command name, is not read', () => {
  for (const [text, segment] of [
    ['$A ps', '$A ps'],
    ['A=$(echo docker); $A ps', '$A ps'],
    ['A=$B; $A ps', '$A ps'],
    ['A="$B"; $A ps', '$A ps'],
    ['A=docker $A ps', '$A ps'],
    ['A=docker; echo $A ps', 'echo $A ps'],
    ["A=docker; '$A' ps", "'$A' ps"],
    ['A="docker compose"; "$A" up', '"$A" up'],
  ]) {
    const result = split(text);
    assert.ok(result.segments.includes(segment), `${text}: ${result.segments}`);
    assert.equal(result.forms.includes('variable'), false, text);
  }
});

test('a git clone, init, worktree add or move, or bundle create to an absolute, home or parent path is marked, with options skipped', () => {
  for (const text of [
    'git clone https://x/a.git /tmp/x', 'git clone https://x/a.git ~/tools', 'git clone https://x/a.git ../x', 'git clone https://x/a.git a/../x',
    'git clone --depth 1 -b main https://x/a.git /abs', 'git clone https://x/a.git "/abs/x"', 'git clone -- https://x/a.git /abs', 'git clone --branch=v1 u /abs',
    'git init /tmp/x', 'git init ~/x', 'git init ../x', 'git init -b main /abs', 'git init --template t sub/../x',
    'git worktree add /tmp/w', 'git worktree add -b feat ../w main', 'git worktree add --reason r ~/w', 'git worktree move a /abs', 'git worktree move ../a b',
    'git bundle create /tmp/x.bundle HEAD', 'git bundle create --quiet ../x.bundle main',
    'git -C dir clone u /abs', 'git -c k=v clone u ~/x', 'git --no-pager -C d -c a=b init ../x', 'git --git-dir /g worktree add /tmp/w', 'git -p bundle create /x HEAD',
  ]) assert.ok(split(text).forms.includes('path'), text);
});

test('a relative path, a path in a position that is no path, or another git command is not marked', () => {
  for (const text of [
    'git clone https://x/a.git vendor/lib', 'git clone https://x/a.git', 'git clone --depth 1 https://x/a.git vendor/lib', 'git clone -b ../x https://x/a.git vendor/lib',
    'git clone --depth /abs https://x/a.git', 'git clone https://x/a.git vendor/..lib', 'git status /tmp/x', 'echo git clone u /tmp/x', 'git clone u "$DIR"',
    'git init', 'git init sub', 'git init -b ../x sub', 'git worktree add wt ../x', 'git worktree list /tmp', 'git worktree move a b', 'git worktree remove /tmp/w',
    'git bundle create out.bundle HEAD ../x', 'git bundle verify /tmp/x.bundle', 'git bundle create',
    'git -C dir clone u vendor/x', 'git -c k=/abs init sub', 'git -C clone /abs', 'git --no-pager status /tmp', 'git -C', 'git -c',
  ]) assert.equal(split(text).forms.includes('path'), false, text);
});

function setup(t, patterns) {
  const repo = scratch(t, FILES);
  repo.write('.claude/settings.json', JSON.stringify({ sandbox: { enabled: true, excludedCommands: patterns } }));
  return (command) => repo.script('check-exempt-command.mjs', [], JSON.stringify({ cwd: repo.dir, tool_name: 'Bash', tool_input: { command } }));
}

test('the hook denies a variable command name that would match an exemption and names the command to write out', (t) => {
  const result = setup(t, ['docker *'])('A=docker; $A ps');
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /^16-command-execution\.md: `docker ps` is exempt/);
  assert.match(result.stderr, /a command name taken from a variable/);
});

test('the hook denies a git path outside the working tree under an exemption and asks for a relative one', (t) => {
  const fire = setup(t, ['git *']);
  for (const command of ['git clone https://x/a.git /tmp/x', 'git clone https://x/a.git ~/tools', 'git init ../x', 'git worktree add /tmp/w', 'git bundle create ~/x.bundle HEAD']) {
    const result = fire(command);
    assert.equal(result.status, 2, command);
    assert.match(result.stderr, /^16-command-execution\.md: /, command);
    assert.match(result.stderr, /relative path with no `\.\.` segment/, command);
    assert.equal(result.stderr.includes('Run exactly'), false, command);
  }
  const relative = fire('git clone https://x/a.git vendor/lib');
  assert.deepEqual([relative.status, relative.stdout, relative.stderr], [0, '', ''], 'relative');
});

test('the hook stays silent when no exemption would match the command', (t) => {
  for (const [patterns, command] of [[['docker *'], '$A ps'], [['docker *'], 'A=echo; $A ps'], [['docker *'], 'git clone u /tmp/x'], [['git clone u vendor*'], 'git clone u /tmp/x']]) {
    const result = setup(t, patterns)(command);
    assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', ''], command);
  }
});
