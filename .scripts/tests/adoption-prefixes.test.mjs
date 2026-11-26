// The instruction check leaves free the prefixes a project retired before it
// adopted the baseline, and keeps reporting the ones retired afterwards.

import assert from 'node:assert/strict';
import test from 'node:test';
import { makeRepo } from './support.mjs';

const RETIRED = /retired one \(01-meta-guidelines\.md\): (.*)/;

function withRules(repo, names) {
  for (const name of names) repo.write(`.agents/instructions/${name}`, `# ${name}\n\nRead when needed.\n\n- One rule.\n`);
  repo.write('AGENTS.md', names.map((name) => `- \`${name}\`: x.\n`).join(''));
}

function commit(repo, message) {
  repo.git('add', '-A', '--', '.gitignore', 'AGENTS.md', '.agents');
  repo.git('commit', '-q', '-m', message);
}

test('instruction check: prefixes retired before the adoption commit stay free, later ones do not', (t) => {
  const repo = makeRepo(t);
  withRules(repo, ['05-old.md', '06-project.md']);
  commit(repo, 'project instructions');
  repo.git('rm', '-q', '--', '.agents/instructions/05-old.md');
  commit(repo, 'retire before adoption');
  repo.git('rm', '-q', '--', '.agents/instructions/06-project.md');
  repo.write('.agents/template-version', '1\n');
  withRules(repo, ['07-template.md', '08-after.md']);
  commit(repo, 'adopt the baseline');
  repo.git('rm', '-q', '--', '.agents/instructions/08-after.md');
  withRules(repo, ['07-template.md']);
  commit(repo, 'retire after adoption');
  withRules(repo, ['05-reuse.md', '06-reuse.md', '07-template.md', '08-reuse.md']);
  const result = repo.script('check-instructions.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(RETIRED.exec(result.stdout)?.[1], '08-reuse.md (retired 08-after.md)');
});

test('instruction check: an uncommitted adoption leaves every earlier retirement free', (t) => {
  const repo = makeRepo(t);
  withRules(repo, ['05-old.md']);
  commit(repo, 'project instructions');
  repo.git('rm', '-q', '--', '.agents/instructions/05-old.md');
  commit(repo, 'retire before adoption');
  withRules(repo, ['05-reuse.md']);
  assert.match(repo.script('check-instructions.mjs').stdout, /05-reuse\.md \(retired 05-old\.md\)/);
  repo.write('.agents/template-version', '1\n');
  const result = repo.script('check-instructions.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /retired/);
});

const listing = (repo, paths) => repo.write('.agents/template-manifest.json', JSON.stringify({ version: '9.0.0', files: Object.fromEntries(paths.map((path) => [path, 'x'])) }));

// A project that adopted the baseline with these instruction files and .readme/ documents, retired them all in a later
// commit, and now holds the instruction files given.
function adopted(repo, retired, current, readme = []) {
  withRules(repo, retired);
  repo.write('.agents/template-version', '1\n');
  for (const name of readme) repo.write(`.readme/${name}`, '# x\n');
  repo.git('add', '-A', '--', '.readme');
  commit(repo, 'adopt the baseline');
  repo.git('rm', '-q', '--', ...retired.map((name) => `.agents/instructions/${name}`), ...readme.map((name) => `.readme/${name}`));
  withRules(repo, ['01-base.md']);
  commit(repo, 'retire after adoption');
  withRules(repo, ['01-base.md', ...current]);
}

test('instruction check: a derived project is not told that a file the template manifest lists reuses a retired prefix', (t) => {
  const repo = makeRepo(t);
  adopted(repo, ['16-documentation.md'], ['16-command-execution.md']);
  listing(repo, ['.agents/instructions/16-command-execution.md']);
  const result = repo.script('check-instructions.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /retired/);
});

test('instruction check: a derived project is not told that a .readme/ document the manifest lists reuses a retired prefix', (t) => {
  const repo = makeRepo(t);
  adopted(repo, [], [], ['95-old.md']);
  repo.write('.readme/95-new.md', '# New\n');
  listing(repo, ['.readme/95-new.md']);
  const result = repo.script('check-instructions.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /\.readme\/ documents reusing the prefix of a retired one/);
});

test('instruction check: a derived project is still told when its own file reuses a retired prefix', (t) => {
  const repo = makeRepo(t);
  adopted(repo, ['16-documentation.md', '17-gone.md'], ['16-command-execution.md', '17-own.md']);
  listing(repo, ['.agents/instructions/16-command-execution.md']);
  const result = repo.script('check-instructions.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(RETIRED.exec(result.stdout)?.[1], '17-own.md (retired 17-gone.md)');
});

test('instruction check: in a checkout of the template a file the manifest lists is still told when it reuses a retired prefix', (t) => {
  const repo = makeRepo(t);
  adopted(repo, ['16-documentation.md'], ['16-command-execution.md']);
  listing(repo, ['.agents/instructions/16-command-execution.md']);
  repo.write('.github/workflows/template-checks.yml', 'name: x\n');
  repo.git('add', '-A', '--', '.github');
  repo.git('commit', '-q', '-m', 'template marker');
  const result = repo.script('check-instructions.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(RETIRED.exec(result.stdout)?.[1], '16-command-execution.md (retired 16-documentation.md)');
});

test('instruction check: without a readable manifest a derived project is told of every reused prefix', (t) => {
  const repo = makeRepo(t);
  adopted(repo, ['16-documentation.md'], ['16-command-execution.md']);
  const check = () => {
    const result = repo.script('check-instructions.mjs');
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const told = '16-command-execution.md (retired 16-documentation.md)';
  assert.equal(RETIRED.exec(check())?.[1], told);
  repo.write('.agents/template-manifest.json', '{ not json');
  assert.equal(RETIRED.exec(check())?.[1], told);
  repo.write('.agents/template-manifest.json', '{}');
  assert.equal(RETIRED.exec(check())?.[1], told);
  listing(repo, ['.agents/instructions/16-command-execution.md']);
  assert.doesNotMatch(check(), /retired/);
});
