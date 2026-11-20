// Helpers for the release tests: a maintained template checkout whose origin is a local bare repository, so that a
// release can push to it without a network, and a runner for the release script from any folder.

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { cli, commit, template } from './template-manifest-fixture.mjs';
import { ROOT, run } from './support.mjs';

export const NOTES = (repo) => join(repo.dir, '.temp', 'notes.md');

// A template at version `version` with a current manifest, clean, whose origin is an empty bare repository, and with
// release notes in NOTES(repo), a file git ignores.
export function releasable(t, version = '1.0.0') {
  const repo = template(t);
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const remote = mkdtempSync(join(ROOT, '.temp', 'remote-'));
  t.after(() => rmSync(remote, { recursive: true, force: true, maxRetries: 5 }));
  run('git', ['init', '--bare', '-q', remote]);
  repo.git('remote', 'set-url', 'origin', remote);
  repo.write('.readme/96-template-adoption.md', `La plantilla mantenida es el repositorio cuyo remoto \`origin\` apunta a \`${remote}\`, como fija otra regla.\n`);
  repo.write('.agents/template-version', `${version}\n`);
  repo.write('.temp/notes.md', 'Release notes\n');
  cli(repo, '--write');
  commit(repo);
  repo.remote = remote;
  repo.head = () => repo.git('rev-parse', 'HEAD').stdout.trim();
  repo.branch = () => repo.git('symbolic-ref', '--short', 'HEAD').stdout.trim();
  repo.remoteRefs = () => run('git', ['-C', remote, 'for-each-ref', '--format=%(refname) %(objectname)'], {}).stdout.trim();
  return repo;
}

// The release script run from folder `from` of the repository, which is the root by default.
export const release = (repo, args, from = repo.dir) => run(process.execPath, [join(repo.dir, '.scripts', 'release.mjs'), ...args], { cwd: from });
