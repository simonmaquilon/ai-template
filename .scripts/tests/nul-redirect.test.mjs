import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { nulRedirect } from '../nul-redirect.mjs';
import { ROOT, WINDOWS, hookFor, makeRepo, runClientHook } from './support.mjs';

const DENIED = ['dir 2>NUL', 'echo hi > nul', 'make &>NUL', 'make >>NUL', 'make > Nul 2>&1', 'x 2> NUL; ls', 'x > "NUL"', "x >'nul'",
  'x 2>NUL 1>&2', 'a | b 2>nul', 'x > ./NUL', 'x > out/NUL', 'bash -c "x 2>NUL"', 'x > /dev/null 2>NUL', '>NUL', 'echo a\necho b > NUL',
  'if x; then y 2>NUL; fi', 'x $(y 2>NUL)', 'cat <<EOF > NUL\nbody\nEOF', 'x | tee NUL', 'x | tee -a nul', 'x 2>&1 | tee ./Nul', 'x >| NUL',
  'x >& nul'];
const ALLOWED = ['echo NUL', 'grep NUL file.txt', 'x > NULL', 'x > nul.txt', 'x > x/NULfoo', 'x > /dev/null', 'x 2>/dev/null', 'x &>/dev/null',
  'echo "x > NUL"', "echo 'dir 2>NUL'", 'cat < NUL', 'x > null', 'x > NUL/out.txt', 'x > MENUL', 'git commit -m "redirect to NUL"', 'echo nul # > nul',
  'pwsh -c "x 2>NUL"', 'powershell -Command "x > NUL"', 'x | tee nul.log', 'x | tee NULL', 'x >&2', 'x 2>&1', 'x >| out.txt', 'x >& log.txt', ''];

// A command nested so deep that the shell reader gives up.
let nested = 'x 2>NUL';
for (let i = 0; i < 10; i++) nested = `eval ${JSON.stringify(nested)}`;

const fire = (client, repo, input) => runClientHook(client, hookFor(client, 'PreToolUse', 'check-nul-redirect.mjs'), repo,
  { input: { cwd: repo.dir, tool_name: 'Bash', ...input } });
const command = (text) => ({ tool_input: { command: text } });

test('the NUL reader names the target of an output redirection to the file NUL in any letter case', () => {
  for (const text of DENIED) assert.match(nulRedirect(text, { cwd: ROOT }) ?? '', /(?:^|[\\/])nul$/i, text);
  for (const text of ALLOWED) assert.equal(nulRedirect(text, { cwd: ROOT }), null, text);
  assert.equal(nulRedirect(['echo', '>', 'NUL'], { cwd: ROOT }), null);
  assert.throws(() => nulRedirect(nested, { cwd: ROOT }));
});

test('a .bat or .cmd file run from Bash is read as cmd reads it, where NUL is the null device; a shell script is not', (t) => {
  const repo = makeRepo(t);
  repo.write('gradlew.bat', '@echo off\r\njava -version >NUL 2>&1\r\n');
  repo.write('b.cmd', 'dir > nul\r\n');
  repo.write('wrap.sh', './b.cmd\n');
  repo.write('s.sh', 'ls 2>NUL\n');
  for (const text of ['./gradlew.bat build', './b.cmd', 'sh ./wrap.sh', 'source ./b.cmd']) {
    assert.equal(nulRedirect(text, { cwd: repo.dir }), null, text);
    const result = fire('claude', repo, command(text));
    assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', ''], text);
  }
  assert.equal(nulRedirect('./s.sh', { cwd: repo.dir }), 'NUL');
  assert.equal(nulRedirect('sh ./s.sh', { cwd: repo.dir }), 'NUL');
  assert.equal(fire('claude', repo, command('./s.sh')).status, 2);
});

for (const client of ['claude', 'codex']) {
  test(`${client}: the NUL hook rejects a redirection to NUL, citing its rule and pointing to /dev/null`, (t) => {
    const repo = makeRepo(t);
    for (const text of DENIED) {
      const result = fire(client, repo, command(text));
      // Where the Codex Bash tool may run PowerShell, on Windows, NUL is the null device and nothing is rejected.
      if (WINDOWS && client === 'codex') {
        assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', ''], text);
        continue;
      }
      assert.equal(result.status, 2, `${text}: ${result.stdout}${result.stderr}`);
      assert.equal(result.stdout, '', text);
      assert.match(result.stderr, /^03-code-authoring\.md: this command redirects output to ".*[nN][uU][lL]"/, text);
      assert.match(result.stderr, /redirect to \/dev\/null instead\.\s*$/, text);
    }
  });

  test(`${client}: the NUL hook stays silent for what is not a redirection to NUL, and never blocks on its own errors`, (t) => {
    const repo = makeRepo(t);
    for (const text of [...ALLOWED, nested]) {
      const result = fire(client, repo, command(text));
      assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', ''], text);
    }
    for (const input of [{}, { tool_input: {} }, { tool_input: { command: ['echo', '>', 'NUL'] } }, { tool_name: 'PowerShell', ...command('x 2>NUL') },
      { tool_name: 'Read', ...command('x 2>NUL') }, { tool_name: 'Monitor', tool_input: { ws: { url: 'wss://example.invalid/feed' } } }]) {
      const result = fire(client, repo, input);
      assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', ''], JSON.stringify(input));
    }
  });
}

test('the NUL hook only rejects: it neither deletes nor creates any file', (t) => {
  const repo = makeRepo(t);
  repo.write('keep/file.txt', 'kept\n');
  repo.write('keep/nulled.txt', 'a file the command must not remove\n');
  const listing = () => readdirSync(repo.dir, { recursive: true }).filter((path) => !path.startsWith('.git')).sort();
  const before = listing();
  assert.equal(fire('claude', repo, command('rm keep/file.txt keep/nul 2>NUL')).status, 2);
  assert.deepEqual(listing(), before);
  assert.equal(readFileSync(join(repo.dir, 'keep', 'nulled.txt'), 'utf8'), 'a file the command must not remove\n');
});

test('the NUL hook runs for Bash and Monitor alone in Claude Code, and the Codex Windows form reads the command as possible PowerShell', () => {
  const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'));
  const group = settings.hooks.PreToolUse.find((candidate) => JSON.stringify(candidate).includes('check-nul-redirect.mjs'));
  assert.equal(group.matcher, 'Bash|Monitor');
  const codex = hookFor('codex', 'PreToolUse', 'check-nul-redirect.mjs');
  assert.match(codex.commandWindows, /-- --powershell$/);
  assert.doesNotMatch(codex.command, /--powershell/);
});
