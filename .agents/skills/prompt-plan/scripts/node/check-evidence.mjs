// Saves text from stdin as a fragment's evidence: node evidence.mjs NN <name> <ext>
// Copied to check/evidence.mjs. Writes the text, with values shaped like secrets masked by lib's redact, to
// review/NN-<name>-<UTC stamp>.<ext>, the name lib's latestEvidence reads, and prints its path relative to the project
// root. The fragment is 01 to 99, as for all.mjs; the name starts with a letter, digit or "_", which keeps it from reading as a flag, holds only letters, digits, "-" and "_", and follows lib's reserved-name rules; the extension holds
// only letters and digits. Exit status: 0 on success, 2 on misuse. all.mjs never runs it.
import { readFileSync, writeFileSync } from 'node:fs';
import { evidenceFile, redact, relativeToRoot } from './lib.mjs';

const [number, name, ext, ...extra] = process.argv.slice(2);
if (extra.length || !/^(?:0[1-9]|[1-9]\d)$/.test(number ?? '') || !/^\w[\w-]*$/.test(name ?? '') || !/^[a-z0-9]+$/i.test(ext ?? '')) {
  console.error('Usage: node evidence.mjs NN <name> <ext>, with the text on stdin; NN is a fragment number from 01, the name starts with a letter, digit or _ and holds letters, digits, - and _, and the extension letters and digits.');
  process.exit(2);
}
let file;
try {
  file = evidenceFile(number, name, ext);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
writeFileSync(file, redact(readFileSync(0, 'utf8')));
console.log(relativeToRoot(file));
