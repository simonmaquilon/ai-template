import assert from 'node:assert/strict';
import test from 'node:test';
import { splitCommand } from '../exempt-command.mjs';
import { isExempt } from '../exempt-match.mjs';

const split = (text, options) => {
  const { segments, forms } = splitCommand(text, options);
  return { segments, forms: [...forms].sort() };
};

test('a lone command has no form, and a descriptor duplication is not one', () => {
  assert.deepEqual(split('node a.mjs --x "b c"'), { segments: ['node a.mjs --x "b c"'], forms: [] });
  assert.deepEqual(split('node a.mjs 2>&1'), { segments: ['node a.mjs 2>&1'], forms: [] });
  assert.deepEqual(split('node a.mjs >&2'), { segments: ['node a.mjs >&2'], forms: [] });
});

test('each breaking form is named and removed from its segment', () => {
  assert.deepEqual(split('a > f'), { segments: ['a'], forms: ['redirection'] });
  assert.deepEqual(split('a 2>> f 2>&1'), { segments: ['a 2>&1'], forms: ['redirection'] });
  assert.deepEqual(split('a &> f'), { segments: ['a'], forms: ['redirection'] });
  assert.deepEqual(split('a < f'), { segments: ['a'], forms: ['redirection'] });
  assert.deepEqual(split('a | b'), { segments: ['a', 'b'], forms: ['pipe'] });
  assert.deepEqual(split('a && b || c; d'), { segments: ['a', 'b', 'c', 'd'], forms: ['chain'] });
  assert.deepEqual(split('a\nb'), { segments: ['a', 'b'], forms: ['chain'] });
  assert.deepEqual(split('A=1 B="x y" a'), { segments: ['a'], forms: ['env'] });
  assert.deepEqual(split('cd x && a'), { segments: ['a'], forms: ['cd', 'chain'] });
  assert.deepEqual(split('sudo a'), { segments: ['a'], forms: ['prefix'] });
  assert.deepEqual(split('xargs a'), { segments: ['a'], forms: ['prefix'] });
  assert.deepEqual(split('x $(a)'), { segments: ['x', 'a'], forms: ['substitution'] });
  assert.deepEqual(split('x `a`'), { segments: ['x', 'a'], forms: ['substitution'] });
  assert.deepEqual(split('(a)'), { segments: ['a'], forms: ['subshell'] });
});

test('quoted text, here-document bodies and escaped characters are not commands or operators', () => {
  assert.deepEqual(split('echo "a | b > c; d"'), { segments: ['echo "a | b > c; d"'], forms: [] });
  assert.deepEqual(split("echo 'a && b'"), { segments: ["echo 'a && b'"], forms: [] });
  assert.deepEqual(split('cat <<EOF\na | b\nEOF'), { segments: ['cat'], forms: ['redirection'] });
  assert.deepEqual(split('echo a\\;b'), { segments: ['echo a\\;b'], forms: [] });
  assert.deepEqual(split('echo "$(a)"'), { segments: ['a', 'echo "$(a)"'], forms: ['substitution'] });
});

test('a control keyword or group brace before a command is removed from its segment and marks a block', () => {
  const found = (text, segment, ...forms) => {
    const result = split(text);
    assert.ok(result.segments.includes(segment), `${text}: ${result.segments}`);
    for (const form of forms) assert.ok(result.forms.includes(form), `${text}: ${form} in ${result.forms}`);
  };
  found('if gh pr view 1 > /dev/null; then echo ok; fi', 'gh pr view 1', 'block', 'redirection');
  found('if a; then gh pr view 1; fi', 'gh pr view 1', 'block');
  found('if a; then b; elif gh pr view 1; then c; fi', 'gh pr view 1', 'block');
  found('if a; then b; else gh pr view 1; fi', 'gh pr view 1', 'block');
  found('{ gh pr view 1; } > out', 'gh pr view 1', 'block', 'redirection');
  found('for i in 1 2; do gh pr view $i; done', 'gh pr view $i', 'block');
  found('while gh pr view 1; do b; done', 'gh pr view 1', 'block');
  found('until gh pr view 1; do b; done', 'gh pr view 1', 'block');
  found('! gh pr view 1', 'gh pr view 1', 'block');
});

test('the word after a process substitution is a command, not the target of the redirection before it', () => {
  assert.deepEqual(split('x < <(gh pr list)'), { segments: ['x', 'gh pr list'], forms: ['redirection', 'subshell'] });
  assert.deepEqual(split('x > >(gh pr list)'), { segments: ['x', 'gh pr list'], forms: ['redirection', 'subshell'] });
});

test('a keyword or a command name that is only quoted, written in a here-document or passed as text stays no command', () => {
  assert.deepEqual(split('echo "if gh pr view 1; then"'), { segments: ['echo "if gh pr view 1; then"'], forms: [] });
  assert.deepEqual(split('echo if gh pr view 1'), { segments: ['echo if gh pr view 1'], forms: [] });
  assert.deepEqual(split("git commit -m 'do gh pr view 1'"), { segments: ["git commit -m 'do gh pr view 1'"], forms: [] });
  assert.deepEqual(split('cat <<EOF\nif gh pr view 1\nEOF'), { segments: ['cat'], forms: ['redirection'] });
  assert.deepEqual(split('echo ${HOME} ! {'), { segments: ['echo ${HOME} ! {'], forms: [] });
});

test('in PowerShell a backslash is a path separator and a backtick escapes', () => {
  assert.deepEqual(split('node .\\scripts\\a.mjs | tail', { powershell: true }), { segments: ['node .\\scripts\\a.mjs', 'tail'], forms: ['pipe'] });
  assert.deepEqual(split('echo a`;b', { powershell: true }), { segments: ['echo a`;b'], forms: [] });
});

test('exemption patterns follow the syntax of a permission rule', () => {
  assert.equal(isExempt(['docker *'], 'docker'), true);
  assert.equal(isExempt(['docker *'], 'docker compose up'), true);
  assert.equal(isExempt(['docker *'], 'dockerd'), false);
  assert.equal(isExempt(['docker'], 'docker ps'), false);
  assert.equal(isExempt(['docker'], 'docker'), true);
  assert.equal(isExempt(['gh pr view*'], 'gh pr view 12'), true);
  assert.equal(isExempt(['gh pr view*'], 'gh pr viewer'), true);
  assert.equal(isExempt(['pnpm run test *'], 'pnpm run test:e2e'), false);
  assert.equal(isExempt(['pnpm run test *'], 'pnpm run test'), true);
  assert.equal(isExempt(['a.b *'], 'axb'), false);
  assert.equal(isExempt([], 'anything'), false);
});
