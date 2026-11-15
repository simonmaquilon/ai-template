import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';
import { protectedPaths, shellWrites } from '../protected-paths.mjs';
import { differences, fingerprint } from '../protected-paths-state.mjs';
import { WINDOWS } from './support.mjs';
import { PROTECTED, SETTINGS, project } from './protected-paths-fixture.mjs';

const WRITES = [
  ['echo x > .agents/tool-versions.json', '.agents/tool-versions.json'], ['echo x >> .scripts/a.mjs', '.scripts'], ['x 2> .codex/hooks.json', '.codex'],
  ['x &>config/out.log', 'config'], ['cat a | tee docs/b.md', 'docs'], ['tee -a docs/b.md < a', 'docs'], ['rm -rf .scripts/old', '.scripts'],
  ['rm -rf .scripts/*', '.scripts'], ['rm .scripts/a.mjs .codex/x', '.scripts'], ['unlink docs/a.md', 'docs'], ['rmdir config', 'config'],
  ['mv .scripts/a.mjs ../a.bak', '.scripts'], ['mv a.txt docs/', 'docs'], ['cp a.txt .agents/tool-versions.json', '.agents/tool-versions.json'],
  ['cp -r a b docs/', 'docs'], ['cp -t config a b', 'config'], ['install -m 644 a docs/a.md', 'docs'], ['ln -sf a docs/link', 'docs'],
  ['sed -i s/a/b/ .codex/hooks.json', '.codex'], ["sed -i '' s/a/b/ docs/a.md", 'docs'], ['sed -ni 5p docs/a.md', 'docs'],
  ['sed --in-place=.bak s/a/b/ docs/a.md', 'docs'], ['perl -pi -e s/a/b/ docs/a.md', 'docs'], ['truncate -s 0 .agents/tool-versions.json', '.agents/tool-versions.json'],
  ['chmod +x .scripts/a.mjs', '.scripts'], ['chown me docs/a.md', 'docs'], ['touch config/new.json', 'config'], ['mkdir .codex/new', '.codex'],
  ['git checkout -- .scripts', '.scripts'], ['git checkout HEAD -- docs/a.md', 'docs'], ['git restore docs/a.md', 'docs'],
  ['git restore --worktree --staged docs/a.md', 'docs'], ['git rm -r config', 'config'], ['git clean -fd docs', 'docs'], ['git mv docs/a.md b.md', 'docs'],
  ['git -C docs checkout .', 'docs'], ['bash -c "echo x > .scripts/a"', '.scripts'], ["sh -c 'rm docs/a.md'", 'docs'], ['sudo rm docs/a.md', 'docs'],
  ['eval "rm docs/a.md"', 'docs'], ['f=docs/a.md; rm $f', 'docs'], ['rm docs/$f', 'docs'], ['rm "docs/a b.md"', 'docs'], ['cd docs && rm a.md', 'docs'],
  ['cd .scripts; echo x > a.mjs', '.scripts'], ['cd docs\ncd ..\nrm .scripts/a.mjs', '.scripts'], ['cd sub && cd .. && rm docs/a.md', 'docs'],
  ['echo x > ./docs/../docs/a.md', 'docs'], ['rm -- docs/a.md', 'docs'], ['cp --target-directory=config x', 'config'], ['echo x >| docs/a.md', 'docs'],
  ['echo x >& docs/a.md', 'docs'], ['rm $PWD/docs/a.md', 'docs'], ['rm ${PWD}/docs/a.md', 'docs'], ['rm $CLAUDE_PROJECT_DIR/docs/a.md', 'docs'],
  ['rm "$CLAUDE_PROJECT_DIR"/.scripts/*', '.scripts'], ['rm ${CLAUDE_PROJECT_DIR}/.codex/hooks.json', '.codex'], ['cd sub && rm $CLAUDE_PROJECT_DIR/docs/a.md', 'docs'],
  ['git rm docs/a.md', 'docs'], ['git clean -fd docs', 'docs'], ['git mv docs/a.md b.md', 'docs'],
];
const POWERSHELL = [['Set-Content .scripts\\a.mjs hi', '.scripts'], ['Add-Content -Path docs\\a.md -Value x', 'docs'], ['Remove-Item -Recurse -Force .scripts', '.scripts'],
  ['Out-File -FilePath docs\\a.md', 'docs'], ['"x" | Out-File config/a.json', 'config'], ['Copy-Item a.txt -Destination .codex\\y', '.codex'],
  ['Move-Item .agents\\tool-versions.json x', '.agents/tool-versions.json'], ['New-Item docs\\b.md', 'docs'], ['echo x > .scripts\\a.mjs', '.scripts'],
  ['ri docs/a.md', 'docs'], ['Set-Location docs; Remove-Item a.md', 'docs'], ['Remove-Item $PWD\\docs\\a.md', 'docs'],
  ['Remove-Item $pwd/docs/a.md', 'docs'], ['Remove-Item $env:CLAUDE_PROJECT_DIR\\.scripts\\a.mjs', '.scripts']];
const READS = ['cat .scripts/a.mjs', 'node .scripts/tool-versions.mjs --add x', 'node .scripts/template-manifest.mjs --write', 'grep x .agents/tool-versions.json',
  'git add .scripts/a.mjs', 'git commit -m "rm .scripts/a.mjs" -- docs/a.md', "echo 'x > .scripts/a'", 'echo "rm docs/a.md"', 'cp .scripts/a.mjs backup.mjs', 'cp -r docs ../docs-copy',
  'git restore --staged docs/a.md', 'git restore -S docs/a.md', 'git status', 'git diff docs', 'git log -- .scripts', 'git checkout main', 'git -C sub checkout .',
  'sed s/a/b/ .codex/hooks.json', 'sed -n 5p docs/a.md', 'ls docs', 'rm sub/.scripts/x.mjs', 'echo x > sub/.scripts/x.mjs', 'echo x > .temp/out.txt',
  'echo x > src/a.ts', 'cd sub && rm .scripts/x.mjs', 'cd sub; echo x > .scripts/y', 'rm .scripts-old/a', 'rm docs2/a.md', 'echo x > .scriptsx', 'rm $HOME/docs/a.md',
  'cd $WORK && rm docs/a.md', 'cd - && rm docs/a.md', 'rm ~/docs/a.md', 'echo x > /var/lib/x', 'tee', 'git checkout -b docs-work', 'mv .scriptsx y', '',
  'git rm --cached docs/a.md', 'git rm -r --cached docs', 'git clean -n docs', 'git clean --dry-run -d docs', 'git clean -fdn docs', 'git mv -n docs/a.md b.md',
  'echo x 2>&1', 'echo x >&2', 'rm $PWD/a.md', 'cd - && rm $PWD/docs/a.md', 'rm $CLAUDE_PROJECT_DIR_X/docs/a.md', 'rm $PWDX/docs/a.md',
  'cp --target-directory=sub x', 'echo x >| out.txt', 'echo x >& out.txt'];

const run = (command, repo, readings = [false], cwd = repo.dir) => shellWrites(command, { readings, cwd, root: repo.dir, paths: PROTECTED });

test('the protected list holds the Edit deny rules and the denyWrite entries that name one path from the root', () => {
  assert.deepEqual(protectedPaths(JSON.stringify(SETTINGS)), PROTECTED);
  assert.deepEqual(protectedPaths('{}'), []);
  assert.deepEqual(protectedPaths(JSON.stringify({ permissions: { deny: 'x' }, sandbox: { filesystem: { denyWrite: [1, null, '.', '..', '../x', '/**'] } } })), []);
  assert.deepEqual(protectedPaths(JSON.stringify({ permissions: { deny: ['Edit(docs/**)', 'Write(docs)', 'Edit(./docs/)'] }, sandbox: { filesystem: { denyWrite: ['./docs'] } } })), ['docs']);
  assert.throws(() => protectedPaths('{ not json'));
});

test('a shell command that writes a protected path in an evident way is found, with the path it protects', (t) => {
  const repo = project(t);
  for (const [command, path] of WRITES) assert.equal(run(command, repo), path, command);
  for (const [command, path] of POWERSHELL) assert.equal(run(command, repo, [true]), path, command);
  assert.equal(run('echo x > .scripts\\a.mjs', repo, [true, false]), '.scripts');
  assert.equal(run(['rm', 'docs/a.md'], repo), 'docs');
});

test('reading a protected path, naming one that is not at the root, or writing where the command cannot be placed is no write', (t) => {
  const repo = project(t);
  for (const command of READS) assert.equal(run(command, repo), null, command);
  assert.equal(run(['cat', '.scripts/a.mjs'], repo), null);
  assert.equal(run('rm .scripts/x.mjs', repo, [false], join(repo.dir, 'sub')), null);
  assert.equal(run('rm a.md', repo, [false], join(repo.dir, 'sub')), null);
  assert.equal(run('rm ../docs/a.md', repo, [false], join(repo.dir, 'sub')), 'docs');
  assert.equal(run('rm a.md', repo, [false], join(repo.dir, 'docs')), 'docs');
  assert.equal(run('rm /etc/hosts', repo), null);
  assert.equal(run(`rm ${join(repo.dir, 'docs', 'a.md').replaceAll('\\', '/')}`, repo), 'docs');
});

test('a link that exists leads to the protected path it points to', (t) => {
  const repo = project(t);
  try {
    symlinkSync(join(repo.dir, 'docs'), join(repo.dir, 'sub', 'shortcut'), WINDOWS ? 'junction' : 'dir');
  } catch (error) {
    t.skip(`cannot create a link: ${error.code}`);
    return;
  }
  assert.equal(run('rm sub/shortcut/a.md', repo), 'docs');
});

test('letter case counts where the file system ignores it', (t) => {
  const repo = project(t);
  assert.equal(run('rm .SCRIPTS/a.mjs', repo), process.platform === 'linux' ? null : '.scripts');
});

test('the fingerprint tells a changed, an added, and a removed file, and skips .temp', (t) => {
  const repo = project(t);
  const paths = [...PROTECTED, '.temp'];
  mkdirSync(join(repo.dir, '.temp', 'cache'), { recursive: true });
  const first = fingerprint(repo.dir, paths);
  assert.equal(first.get('docs'), 'folder');
  assert.match(first.get('docs/a.md'), /^[0-9a-f]{64}$/);
  assert.equal([...first.keys()].some((path) => path.startsWith('.temp')), false);
  assert.deepEqual(differences(first, fingerprint(repo.dir, paths)), []);
  repo.write('docs/a.md', 'changed\n');
  repo.write('docs/new.md', 'new\n');
  repo.write('.temp/cache/x', 'not protected\n');
  assert.deepEqual(differences(first, fingerprint(repo.dir, paths)), ['docs/a.md (changed)', 'docs/new.md (added)']);
  assert.deepEqual(differences(fingerprint(repo.dir, paths), first), ['docs/a.md (changed)', 'docs/new.md (removed)']);
});

test('a Write rule is no protection, since Claude Code matches only Edit rules', () => {
  assert.deepEqual(protectedPaths(JSON.stringify({ permissions: { deny: ['Write(docs/**)', 'Write(/config)'] } })), []);
});

test('$PWD stands for the folder the command runs in and $CLAUDE_PROJECT_DIR for the root, at the start of a word', (t) => {
  const repo = project(t);
  assert.equal(run('rm $PWD/a.md', repo, [false], join(repo.dir, 'docs')), 'docs');
  assert.equal(run('rm $PWD/*', repo, [false], join(repo.dir, 'docs')), 'docs');
  assert.equal(run('rm $PWD/.scripts/x.mjs', repo, [false], join(repo.dir, 'sub')), null);
  assert.equal(run('cd sub && rm $PWD/x.mjs', repo), null);
  assert.equal(run('cd docs && rm ${PWD}/a.md', repo), 'docs');
  assert.equal(run('rm $CLAUDE_PROJECT_DIR/docs/a.md', repo, [false], join(repo.dir, 'sub')), 'docs');
});

test('git -C names the folder it moves to, also as an absolute path after a cd whose target is not known', (t) => {
  const repo = project(t);
  const docs = join(repo.dir, 'docs').replaceAll('\\', '/');
  assert.equal(run(`git -C ${docs} checkout .`, repo), 'docs');
  assert.equal(run(`cd $WORK; git -C ${docs} restore a.md`, repo), 'docs');
  assert.equal(run('cd $WORK; git -C docs restore a.md', repo), null);
  assert.equal(run(`git -C ${docs} status`, repo), null);
  assert.equal(run(`git -C ${docs} restore --staged a.md`, repo), null);
});

// Git Bash on Windows mounts the temporary folder at /tmp: with the temporary folder set to the one that holds the
// project, /tmp/<project> leads to the root on every system, and without the conversion it leads elsewhere.
test('a path of Git Bash is read as the Windows path it leads to, in a word and in git -C', (t) => {
  const repo = project(t);
  const saved = ['TMPDIR', 'TMP', 'TEMP'].map((name) => [name, process.env[name]]);
  for (const [name] of saved) process.env[name] = dirname(repo.dir);
  t.after(() => saved.forEach(([name, value]) => (value === undefined ? delete process.env[name] : (process.env[name] = value))));
  const inTmp = `/tmp/${basename(repo.dir)}`;
  const options = { readings: [false], cwd: repo.dir, root: repo.dir, paths: PROTECTED };
  assert.equal(shellWrites(`rm ${inTmp}/docs/a.md`, { ...options, gitBash: true }), 'docs');
  assert.equal(shellWrites(`rm ${inTmp}/docs/a.md`, options), null);
  assert.equal(shellWrites(`git -C ${inTmp}/docs checkout .`, { ...options, gitBash: true }), 'docs');
  assert.equal(shellWrites(`git -C ${inTmp}/docs checkout .`, options), null);
});
