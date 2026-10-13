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
