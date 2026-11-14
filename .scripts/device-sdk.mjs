// Finds the binaries device.mjs runs from folders the environment names, and trusts none that a confined command could
// have written: each folder must be an absolute path that, with its links resolved, lies outside the folder that holds
// .scripts/ and outside the system temporary folder, and each binary must be a regular file, never a symbolic link
// (adb and emulator) and never found by a lookup on a relative PATH entry (java). `roots` is for the tests to replace.

import { accessSync, constants, lstatSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const real = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
};

export const defaultRoots = () => [resolve(dirname(fileURLToPath(import.meta.url)), '..'), tmpdir()].map((path) => real(path) ?? resolve(path));

const within = (path, roots) => roots.some((root) => {
  const rel = relative(root, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
});

function trusted(value, name, roots) {
  if (!isAbsolute(value)) return { problem: `${name} is not an absolute path` };
  const path = real(value);
  if (path === undefined) return { problem: `${name} is not an existing folder` };
  if (within(path, roots)) return { problem: `${name} is inside the repository or the temporary folder, where a confined command can write` };
  return { path };
}

export const sdkFiles = (os = process.platform) => {
  const ext = os === 'win32' ? '.exe' : '';
  return { adb: ['platform-tools', `adb${ext}`], emulator: ['emulator', `emulator${ext}`] };
};

function binary(home, parts) {
  const file = join(home, ...parts);
  try {
    const stats = lstatSync(file);
    accessSync(file, constants.X_OK);
    return stats.isFile() && !stats.isSymbolicLink() ? file : undefined;
  } catch {
    return undefined;
  }
}

// { home, adb, emulator } of the first candidate folder that holds both binaries, or else of the first candidate, with
// whatever it holds or a `problem` that says why it was refused; {} when neither variable is set.
export function findSdk(env, os = process.platform, roots = defaultRoots()) {
  const files = sdkFiles(os);
  const found = ['ANDROID_HOME', 'ANDROID_SDK_ROOT'].filter((name) => env[name]).map((name) => {
    const { path, problem } = trusted(env[name], name, roots);
    return path === undefined ? { problem } : { home: path, adb: binary(path, files.adb), emulator: binary(path, files.emulator) };
  });
  return found.find((sdk) => sdk.adb && sdk.emulator) ?? found[0] ?? {};
}

const regular = (file, roots) => {
  try {
    const path = real(file);
    return path !== undefined && statSync(path).isFile() && !within(path, roots);
  } catch {
    return false;
  }
};

// { file } of the java to run, from JAVA_HOME when set and otherwise from the first absolute PATH entry that holds one
// outside the roots, or a `problem`. It is only ever run with -version.
export function javaBinary(env, os = process.platform, roots = defaultRoots()) {
  const name = os === 'win32' ? 'java.exe' : 'java';
  if (env.JAVA_HOME) {
    const { path, problem } = trusted(env.JAVA_HOME, 'JAVA_HOME', roots);
    if (path === undefined) return { problem };
    const file = join(path, 'bin', name);
    return regular(file, roots) ? { file } : { problem: `JAVA_HOME has no regular file bin/${name}` };
  }
  const file = (env.PATH ?? env.Path ?? '').split(delimiter).filter(isAbsolute).map((dir) => join(dir, name)).find((candidate) => regular(candidate, roots));
  return file ? { file } : { problem: `no ${name} on an absolute PATH entry outside the repository and the temporary folder` };
}
