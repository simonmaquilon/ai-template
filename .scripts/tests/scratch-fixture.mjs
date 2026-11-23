// A scratch folder under .temp/ that holds copies of the named scripts of .scripts/ and no git repository, for tests of
// scripts that read their own location and files and run no git, so that they also run where git cannot write hooks.

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, run } from './support.mjs';

export function scratch(t, scripts) {
  mkdirSync(join(ROOT, '.temp'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.temp', 'scratch-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  mkdirSync(join(dir, '.scripts'));
  for (const name of scripts) cpSync(join(ROOT, '.scripts', name), join(dir, '.scripts', name));
  return {
    dir,
    write(path, text) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    },
    script: (name, args = [], input) => run(process.execPath, [join('.scripts', name), ...args], { cwd: dir, input }),
  };
}
