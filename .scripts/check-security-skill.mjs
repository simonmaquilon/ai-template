#!/usr/bin/env node
// Verify the adopted security-audit skill against its lock entry, offline. The
// root-license overlay is checked separately from the upstream skill-folder hash.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { enterRepositoryRoot } from './hook-support.mjs';
import { securitySkillHash } from './security-skill-hash.mjs';

const LICENSE_HASH = 'e598e694aa506650c7192d5ea3be0e50aca0d356ea00551c53429f0b01eb6391';
try {
  if (!enterRepositoryRoot()) throw new Error('Repository root unavailable');
  const lock = JSON.parse(readFileSync('skills-lock.json', 'utf8'));
  const entry = lock.skills?.['security-audit'];
  if (entry?.source !== 'cloudflare/security-audit-skill' || entry.sourceType !== 'github'
    || entry.skillPath !== 'skills/security-audit/SKILL.md' || !/^[a-f0-9]{64}$/.test(entry.computedHash ?? '')) {
    throw new Error('Invalid security-audit lock entry');
  }
  const dir = join('.agents', 'skills', 'security-audit');
  if (securitySkillHash(dir) !== entry.computedHash) throw new Error('security-audit skill does not match computedHash in skills-lock.json');
  const license = join(dir, 'LICENSE');
  if (!lstatSync(license).isFile() || lstatSync(license).isSymbolicLink()
    || createHash('sha256').update(readFileSync(license)).digest('hex') !== LICENSE_HASH) throw new Error('Upstream license overlay does not match its adopted checksum');
  console.log('security-audit skill content and license integrity verified.');
} catch (error) {
  console.error(`Security skill integrity: ${error.message}`);
  process.exitCode = 1;
}
