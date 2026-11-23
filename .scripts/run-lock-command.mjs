// How run-lock.mjs starts its command without a shell on every system: as given on macOS and Linux and for a Windows
// executable, and for a Windows .cmd or .bat file, such as the pnpm of a package manager, through cmd.exe, since Node
// refuses to start those directly, with delayed expansion off (/v:off). The file is looked up on PATH with PATHEXT as
// Windows does. Limit: an argument holding a double quote or a percent sign, or a resolved path holding a percent sign,
// cannot be passed to a .cmd or .bat file safely, so it is refused.

import { existsSync } from 'node:fs';
import { win32 } from 'node:path';

const BATCH = /\.(?:cmd|bat)$/i;

function quote(arg) {
  if (/["%]/.test(arg)) throw new Error(`run-lock: unsupported argument for a .cmd or .bat command on Windows: ${arg}`);
  return /^$|[\s&|<>^()]/.test(arg) ? `"${arg}"` : arg;
}

// { file, args, verbatim? } for child_process.spawn without a shell.
export function commandLine(command, args, { platform = process.platform, env = process.env, exists = existsSync } = {}) {
  if (platform !== 'win32') return { file: command, args };
  const extensions = /\.\w+$/.test(command) ? [''] : (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean).map((ext) => ext.toLowerCase());
  const dirs = /[\\/]/.test(command) ? [''] : (env.PATH ?? '').split(';').filter(Boolean);
  for (const dir of dirs) {
    for (const extension of extensions) {
      const candidate = dir ? win32.join(dir, command + extension) : command + extension;
      if (!exists(candidate)) continue;
      if (!BATCH.test(candidate)) return { file: command, args };
      if (candidate.includes('%')) throw new Error(`run-lock: unsupported path for a .cmd or .bat command on Windows: ${candidate}`);
      return { file: env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/v:off', '/c', `""${candidate}" ${args.map(quote).join(' ')}"`], verbatim: true };
    }
  }
  return { file: command, args };
}
