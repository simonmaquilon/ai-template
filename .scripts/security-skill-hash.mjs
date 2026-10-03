// Match skills@1.7.0 computeSkillFolderHash: sort portable relative names using
// localeCompare, then hash each name followed by its raw bytes with SHA-256.
// The top-level LICENSE is our verified overlay copied from the upstream root.
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export function securitySkillHash(root) {
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new Error('Non-regular skill root');
  const files = [];
  function collect(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const name = relative(root, full).split('\\').join('/');
      if (name === 'LICENSE') continue;
      if (entry.isSymbolicLink()) throw new Error(`Non-regular skill entry: ${JSON.stringify(name)}`);
      if (entry.isDirectory()) {
        if (!['.git', 'node_modules'].includes(entry.name)) collect(full);
      } else if (entry.isFile()) files.push({ name, full });
      else throw new Error(`Non-regular skill entry: ${JSON.stringify(name)}`);
    }
  }
  collect(root);
  files.sort((a, b) => a.name.localeCompare(b.name));
  const hash = createHash('sha256');
  for (const file of files) hash.update(file.name).update(readFileSync(file.full));
  return hash.digest('hex');
}
