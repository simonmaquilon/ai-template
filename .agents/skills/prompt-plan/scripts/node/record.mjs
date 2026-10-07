// Records a fragment while it is executed:
//   node record.mjs <NN> before    before the fragment starts
//   node record.mjs <NN> after     once its checks pass; writes NN.patch and NN.state
//   node record.mjs <NN> restore   puts the working tree back to the `before` snapshot of a fragment
//                                  that has no `after` yet, such as a failed one about to be retried
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { beforeFile, git, patchFile, selectFragments, snapshotTree, stateFile } from './common.mjs';

const ZERO = /^0+$/;
const [arg, phase] = process.argv.slice(2);
const [number] = selectFragments(arg, { allowAll: false });
const before = beforeFile(number);
const beforeTree = () => {
  if (!existsSync(before)) throw new Error(`Missing ${number}.before: run "node record.mjs ${number} before" first.`);
  return readFileSync(before, 'utf8').trim();
};

if (phase === 'before') {
  writeFileSync(before, `${snapshotTree()}\n`);
  console.log(`Fragment ${number}: initial state recorded.`);
} else if (phase === 'after') {
  const from = beforeTree();
  const to = snapshotTree();
  const files = {};
  // Each --raw entry carries the full hashes before and after for one path.
  const fields = git(['diff', '--raw', '-z', '--no-renames', '--no-abbrev', from, to]).split('\0').filter(Boolean);
  for (let i = 0; i < fields.length; i += 2) {
    const [, , oldHash, newHash] = fields[i].split(' ');
    files[fields[i + 1]] = { before: ZERO.test(oldHash) ? null : oldHash, after: ZERO.test(newHash) ? null : newHash };
  }
  // The patch is written as bytes; a fragment that changes no file gets an empty patch and a state that lists no file.
  writeFileSync(patchFile(number), Object.keys(files).length ? git(['diff', '--binary', '--full-index', from, to], { binary: true }) : Buffer.alloc(0));
  writeFileSync(stateFile(number), `${JSON.stringify({ beforeTree: from, afterTree: to, files }, null, 2)}\n`);
  rmSync(before);
  console.log(`Fragment ${number}: ${Object.keys(files).length} file(s) in ${number}.patch and ${number}.state.`);
} else if (phase === 'restore') {
  if (existsSync(stateFile(number))) throw new Error(`Fragment ${number} is already recorded; use revert.mjs instead.`);
  const now = snapshotTree();
  const back = git(['diff', '--binary', '--full-index', now, beforeTree()], { binary: true });
  if (back.length === 0) {
    console.log(`Fragment ${number}: the working tree already matches its initial state.`);
  } else {
    const temp = `${patchFile(number)}.restore`;
    writeFileSync(temp, back);
    try {
      git(['apply', '--check', '--whitespace=nowarn', temp]);
      git(['apply', '--whitespace=nowarn', temp]);
    } finally {
      rmSync(temp, { force: true });
    }
    console.log(`Fragment ${number}: working tree restored to its initial state.`);
  }
} else {
  throw new Error('Usage: node record.mjs <NN> before|after|restore');
}
