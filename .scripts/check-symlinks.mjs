#!/usr/bin/env node
// Reports tracked symlinks that the checkout wrote as plain files, which breaks
// the agent tooling that relies on them and so the cross-system rule of
// 28-agent-tooling-configuration.md. It happens on Windows when git cannot
// create symlinks. Runs from any directory of the repository and prints plain
// text for the agent clients; prints nothing when every link resolves.

import { existsSync, lstatSync } from 'node:fs';
import { enterRepositoryRoot, git } from './hook-support.mjs';

if (!enterRepositoryRoot()) process.exit(0);

const broken = (git(['ls-files', '-s', '-z']) ?? '')
  .split('\0')
  .filter((entry) => entry.startsWith('120000 '))
  .map((entry) => entry.slice(entry.indexOf('\t') + 1))
  .filter((path) => existsSync(path) && !lstatSync(path).isSymbolicLink());

if (broken.length > 0) {
  console.log(
    `Tracked symlinks checked out as plain files (28-agent-tooling-configuration.md): ${broken.join(', ')}. ` +
      'On Windows, enable Developer Mode, set core.symlinks=true, and check them out again; see .readme/90-agent-skills.md.',
  );
}
