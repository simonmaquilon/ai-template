// Saves text from stdin as a fragment's evidence: node evidence.mjs NN <name> <ext>
// Copied to check/evidence.mjs. Writes the text, with values shaped like secrets masked by lib's redact, to
// review/NN-<name>-<UTC stamp>.<ext>, the name lib's latestEvidence reads, and prints its path relative to the project
// root. The fragment is 01 to 99, as for all.mjs; the name starts with a letter, digit or "_", which keeps it from reading as a flag, holds only letters, digits, "-" and "_", and follows lib's reserved-name rules; the extension holds
// only letters and digits. Exit status: 0 on success, 2 on misuse. all.mjs never runs it.
import { readFileSync, writeFileSync } from 'node:fs';
import { captureCommand, evidenceFile, planDir, redact, relativeToRoot, root } from './lib.mjs';
import { basename } from 'node:path';

const RED_USAGE = 'Usage: node check/evidence.mjs NN red [--test-path <path> ...] --expect <failure text> [--expect <failure text> ...] -- <command> <args>';

async function verifyRed(number, flags) {
  const { BEFORE_LIMIT, captureProject, captureState, declaredTestPaths, hashBytes, localEntry, NUMBER, pathParts, projectFingerprint, readLocal } = await import('./state.mjs');
  const { writeAtomic } = await import('./report.mjs');
  const delimiter = flags.indexOf('--');
  if (!NUMBER.test(number) || delimiter < 0 || delimiter % 2 || !flags[delimiter + 1]) throw new Error(RED_USAGE);
  const testPaths = [];
  const expected = [];
  for (let i = 0; i < delimiter; i += 2) {
    const [flag, value] = flags.slice(i, i + 2);
    if (!value.trim()) throw new Error(RED_USAGE);
    if (flag === '--test-path') {
      pathParts(value);
      testPaths.push(value);
    } else if (flag === '--expect') expected.push(value);
    else throw new Error(RED_USAGE);
  }
  if (!expected.length) throw new Error(RED_USAGE);
  const declared = declaredTestPaths(planDir, number);
  if (JSON.stringify(testPaths.sort()) !== JSON.stringify(declared)) {
    throw new Error('The test paths must match the fragment declarations.');
  }
  const recorded = readLocal(planDir, `patch/${number}.before`, BEFORE_LIMIT)?.toString('utf8').split(/\r?\n/);
  if (!recorded?.[2] || recorded[1] !== root) throw new Error('The fragment needs a current record before state.');
  const recordedProject = JSON.parse(recorded[2]);
  if (JSON.stringify(declared) !== JSON.stringify(recordedProject?.testPaths)) throw new Error('The test path declarations changed since record before.');
  const current = captureProject(root, planDir);
  const prepared = projectFingerprint(current, testPaths);
  if (!prepared || prepared !== projectFingerprint(recordedProject, testPaths)) {
    throw new Error('The project differs from the before state outside the declared test paths.');
  }
  for (const name of testPaths) {
    if (!current.files.some(([path]) => path === name) || !localEntry(root, name)?.info.isFile()) throw new Error('Every declared test must be a tracked or non-ignored regular file.');
  }
  const before = captureState(root, planDir);
  if (!before || projectFingerprint(captureProject(root, planDir)) !== projectFingerprint(current)) throw new Error('Could not fingerprint the prepared tests-before state.');
  const [command, ...args] = flags.slice(delimiter + 1);
  const result = captureCommand(command, args);
  const after = captureState(root, planDir);
  const matched = expected.every((failure) => result.stdout.includes(failure) || result.stderr.includes(failure));
  const status = before !== after ? 'stale' : result.error || result.signal || result.status === null ? 'interrupted'
    : result.status === 0 || !matched ? 'unverified' : 'red';
  const log = redact(`$ ${result.line}\nexit status: ${result.status ?? result.signal ?? 'interrupted'}\n`
    + `\n## stdout\n${result.stdout}\n## stderr\n${result.stderr}${result.error ? `\n${result.error.message}` : ''}\n`);
  const file = evidenceFile(number, 'tests-before', 'log');
  const local = `review/${basename(file)}`;
  const receipt = { version: 1, status, before, after, projectBefore: prepared, testPaths, exit: result.status,
    signal: result.signal, expected: expected.map(redact), sha256: hashBytes(log) };
  writeAtomic(planDir, local, log);
  writeAtomic(planDir, local.replace(/\.log$/, '.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`Tests-before: ${status}. Evidence: ${relativeToRoot(file)}`);
  return status === 'red' ? 0 : 1;
}

const argv = process.argv.slice(2);
if (argv[1] === 'red' && argv[2]?.startsWith('--')) {
  try {
    process.exitCode = await verifyRed(argv[0], argv.slice(2));
  } catch (error) {
    console.error(redact(error.message));
    process.exitCode = 2;
  }
} else {
  const [number, name, ext, ...extra] = argv;
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
}
