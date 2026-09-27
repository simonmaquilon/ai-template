// Decides whether a command stages or commits in bulk against the rule of
// 27-version-control.md, for the staging hooks: git add or git stage with -A,
// --all, -u, --update, a short-option cluster that includes -A or -u, a
// whole-tree pathspec (., ./, ./*, .., ../, :/, or *), only exclude pathspecs,
// or no pathspec, as when xargs or $( ... ) supplies them; and git commit with
// -a, --all, a short-option cluster that includes -a after argument-less flags,
// such as -am or -qam, a whole-tree pathspec, or only exclude pathspecs. Paths
// xargs supplies to git add or git stage count as bulk, and so does
// --pathspec-from-file=- reading them from input. A dry run stages nothing and
// an interactive git add (-p, -i, -e, or their long forms) stages only what is
// chosen, so both pass, unless a pipe or redirection answers for it.
// staging-reader.mjs walks every command the text runs, directly or behind
// aliases, script files, make targets, eval, and shells.

import { GIT, gitSubcommand, walk } from './staging-reader.mjs';

const WHOLE_TREE = new Set(['.', './', './*', '..', '../', ':/', '*']);
const VALUE_OPTIONS = new Set(['-m', '-F', '-C', '-c', '-t', '--message', '--file', '--author', '--date', '--template',
  '--reuse-message', '--reedit-message', '--fixup', '--squash', '--trailer', '--cleanup', '--chmod', '--pathspec-from-file']);

const wholeTree = (path) => WHOLE_TREE.has(path.replace(/\\/g, '/'));

// Whether git arguments, global options included, stage or commit in bulk;
// fed marks input from a pipe or redirection, and xargs paths it supplies.
function bulkGit(args, fed, xargs) {
  const { index } = gitSubcommand(args);
  const staging = args[index] === 'add' || args[index] === 'stage';
  if (!staging && args[index] !== 'commit') return false;
  if (staging && xargs) return true;
  const options = [];
  const paths = [];
  for (let j = index + 1; j < args.length; j++) {
    if (args[j] === '--') {
      paths.push(...args.slice(j + 1));
      break;
    }
    if (VALUE_OPTIONS.has(args[j])) options.push(`${args[j]}=${args[++j] ?? ''}`);
    else (args[j].startsWith('-') ? options : paths).push(args[j]);
  }
  if (options.includes('--dry-run')) return false;
  const interactive = (option) => /^--(?:patch|interactive|edit)$|^-[a-zA-Z]*[pie][a-zA-Z]*$/.test(option);
  if (staging && options.some((option) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(option) || (!fed && interactive(option)))) return false;
  const bulkOption = staging
    ? (option) => option === '--all' || option === '--update' || /^-[a-zA-Z]*[Au][a-zA-Z]*$/.test(option)
    : (option) => option === '--all' || /^-[einopqsvz]*a/.test(option);
  const excludeOnly = paths.length > 0 && paths.every((path) => /^:(?:!|\^|\(exclude\))/.test(path));
  const listed = options.some((option) => /^--pathspec-from-file=(?!-$)./.test(option));
  return options.some(bulkOption) || paths.some(wholeTree) || excludeOnly || (staging && paths.length === 0 && !listed);
}

// Whether a command, as text read with each of the given readings (true for
// PowerShell) or as an argument list, stages or commits in bulk. Throws when
// the command nests too deep to read.
export function isBulk(command, { readings, cwd }) {
  const visit = ({ name, args, fed, xargs }) => GIT.test(name) && bulkGit(args, fed, xargs);
  if (Array.isArray(command)) return walk(command, { cwd, visit });
  return readings.some((powershell) => walk(String(command ?? ''), { powershell, cwd, visit }));
}
