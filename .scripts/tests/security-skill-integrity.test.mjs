import assert from 'node:assert/strict';
import { readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, WINDOWS, makeRepo } from './support.mjs';

// Computed by computeSkillFolderHash of the skills CLI version that STACK.md
// pins: locale ordering puts a.md before B.md, nested names use '/', and .git
// and node_modules are skipped.
const HASH = '8f4134e55dc013e1a02ab25c02114621370200eb72ea66123582a425fe1a891b';
function fixture(t) {
  const repo = makeRepo(t);
  const dir = '.agents/skills/security-audit';
  repo.write(`${dir}/a.md`, 'A\n');
  repo.write(`${dir}/B.md`, 'B\n');
  repo.write(`${dir}/b.json`, '{}\n');
  repo.write(`${dir}/sub/c.txt`, 'C\n');
  repo.write(`${dir}/node_modules/x`, 'skip\n');
  repo.write(`${dir}/.git/y`, 'skip\n');
  repo.write(`${dir}/LICENSE`, readFileSync(join(ROOT, dir, 'LICENSE'), 'utf8'));
  repo.write('skills-lock.json', JSON.stringify({ version: 1, skills: {
    'security-audit': { source: 'cloudflare/security-audit-skill', sourceType: 'github',
      ref: 'a'.repeat(40), skillPath: 'skills/security-audit/SKILL.md', computedHash: HASH },
  } }));
  return repo;
}
const check = (repo) => repo.script('check-security-skill.mjs');

test('security skill integrity follows the skills CLI hash vector with a separate license overlay', (t) => {
  const result = check(fixture(t));
  assert.equal(result.status, 0, result.stderr);
});

test('security skill integrity rejects modified or additional source files', (t) => {
  const repo = fixture(t);
  repo.write('.agents/skills/security-audit/a.md', 'changed\n');
  assert.equal(check(repo).status, 1);
  repo.write('.agents/skills/security-audit/a.md', 'A\n');
  repo.write('.agents/skills/security-audit/extra.md', 'added\n');
  assert.equal(check(repo).status, 1);
});

test('security skill integrity verifies the retained upstream license independently', (t) => {
  const repo = fixture(t);
  repo.write('.agents/skills/security-audit/LICENSE', 'modified license\n');
  const result = check(repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /license/i);
});

test('security skill integrity rejects symlinked skill content without following it', (t) => {
  const repo = fixture(t);
  const outside = makeRepo(t);
  outside.write('private.md', 'private fixture\n');
  symlinkSync(outside.dir, join(repo.dir, '.agents/skills/security-audit/linked'), WINDOWS ? 'junction' : 'dir');
  const result = check(repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /non-regular|symlink/i);
  assert.doesNotMatch(result.stderr, /private fixture/);
});
