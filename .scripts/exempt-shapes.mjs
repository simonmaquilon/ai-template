// Two shapes that the client keeps sandboxed even when an exemption matches (.readme/91-agent-sandbox.md, "Claude Code")
// and that the text of a call can show, for exempt-command.mjs (16-command-execution.md): a command name taken from a
// variable, read only when the same call assigns the variable a literal, and a git clone, init, worktree add or move, or
// bundle create with a path that is absolute, starts with ~ or has a .. segment. A value that is not a literal here,
// such as one inherited from the environment, set by an earlier call, read from a file or produced by a substitution,
// cannot be known from the text.

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;
const NAME = /^(")?\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))\1$/;
// The options before a git subcommand that take the next word as their value; any other option there is a flag.
const GLOBAL_VALUES = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env']);

// The git commands whose path argument keeps a call sandboxed, with the options that take the next word as their value
// and the positions of the arguments that are paths: the destination of a clone, the directory of an init, the path of a
// worktree add, both paths of a worktree move and the file of a bundle create.
const GIT = {
  clone: { values: ['-b', '--branch', '-o', '--origin', '-c', '--config', '-u', '--upload-pack', '-j', '--jobs', '--depth', '--filter', '--reference',
    '--reference-if-able', '--separate-git-dir', '--template', '--shallow-since', '--shallow-exclude', '--server-option', '--bundle-uri', '--revision', '--ref-format'], paths: [1] },
  init: { values: ['-b', '--initial-branch', '--template', '--separate-git-dir', '--object-format', '--ref-format'], paths: [0] },
  'worktree add': { values: ['-b', '-B', '--reason'], paths: [0] },
  'worktree move': { values: [], paths: [0, 1] },
  'bundle create': { values: [], paths: [0] },
};

const unquote = (word) => /^(["'])(.*)\1$/s.exec(word)?.[2] ?? word;

// The text of a value written as a literal, or null when it expands, substitutes or otherwise depends on the shell.
function literal(value) {
  if (/^'[^']*'$/.test(value)) return value.slice(1, -1);
  if (/^"[^"$`\\]*"$/.test(value)) return value.slice(1, -1);
  return /^[^\s"'$`\\;&|<>(){}*?~[\]!#]*$/.test(value) ? value : null;
}

// Records the literal assignments of an assignment-only command, or of an export, in vars.
export function remember(vars, words) {
  for (const word of words) {
    const match = ASSIGNMENT.exec(word);
    if (!match) continue;
    const text = literal(match[2]);
    if (text === null) vars.delete(match[1]);
    else vars.set(match[1], text);
  }
}

// The literal value of a command name that is an unquoted or double-quoted variable, or null. A quoted value that
// holds a space is one command name, not a command with arguments, so it is left alone.
export function expand(word, vars) {
  const [, quote, braced, bare] = NAME.exec(word) ?? [];
  const value = vars.get(braced ?? bare);
  return !value || (quote && /\s/.test(value)) ? null : value;
}

// Whether the words are one of those git commands with a path argument that is absolute, starts with ~ or has a ..
// segment, counting the arguments that are no option.
export function leavesTree(words) {
  let at = 1;
  while (words[0] === 'git' && words[at]?.startsWith('-')) at += GLOBAL_VALUES.has(words[at]) ? 2 : 1;
  const sub = words[0] !== 'git' ? undefined : ['worktree', 'bundle'].includes(words[at]) ? `${words[at]} ${words[at + 1]}` : words[at];
  const shape = Object.hasOwn(GIT, sub) ? GIT[sub] : null;
  if (!shape) return false;
  const positional = [];
  for (let i = at + (sub.includes(' ') ? 2 : 1), ended = false; i < words.length; i++) {
    if (!ended && words[i] === '--') ended = true;
    else if (ended || !words[i].startsWith('-')) positional.push(words[i]);
    else if (shape.values.includes(words[i])) i++;
  }
  return shape.paths.some((index) => {
    const word = positional[index];
    const path = word === undefined ? '' : unquote(word);
    return path.startsWith('/') || word?.startsWith('~') || path.split('/').includes('..');
  });
}
