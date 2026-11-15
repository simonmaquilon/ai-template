// Decides whether a command for a POSIX shell redirects output to the Windows null device, for the NUL hook
// (03-code-authoring.md), and names the target. In Git Bash, and in any POSIX shell, > NUL, 2>NUL, &>nul, and >> NUL
// do not discard the output: they create an ordinary file called NUL, which Windows can hardly delete or version.
// A target counts when its last path segment is NUL in any letter case, so NULL, nul.txt, and x/NULfoo do not; a
// quoted NUL is still a target, but a NUL that is only an argument, or sits inside quoted text, is not. The command
// is read as staging-reader.mjs walks it, so the redirections of a nested shell, as in bash -c '...', count too,
// and so do the files tee writes, except those a PowerShell script or a .bat or .cmd file reads, where NUL is the
// null device. It reads only the command's text.

import { walk } from './staging-reader.mjs';

const NUL = /(?:^|[\\/])nul$/i;
const TEE = /^(?:.*[\\/])?tee(?:\.exe)?$/i;

// The first redirection target or tee file of a command, read as a POSIX shell reads it, that names the file NUL, or
// null. Throws when the command nests too deep to read.
export function nulRedirect(command, { cwd }) {
  let found = null;
  const visit = ({ name, args = [], targets = [], powershell, batch }) => {
    const files = TEE.test(name) ? args.filter((arg) => !arg.startsWith('-')) : [];
    if (!powershell && !batch) found ??= [...targets, ...files].find((target) => NUL.test(target)) ?? null;
    return found !== null;
  };
  walk(Array.isArray(command) ? command : String(command ?? ''), { cwd, visit });
  return found;
}
