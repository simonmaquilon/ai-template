// The brake check-file-length.mjs keeps on how often it blocks a stop, whether or not the client says a Stop hook
// already continued it: per session and turn, in <session>.stop beside the session's turn marker, at most MAX_BLOCKS
// blocks, and none twice for the same set of violations. The file holds the turn marker's time, the identity of the
// turn, then one 16-hex fingerprint per set blocked, one per line, so a new turn marker makes it stale and the idle
// sweep of turn-marker.mjs removes it a week after its last write. Every access goes through safe-fs.mjs, so a
// symlink in .temp/ leads nowhere.

import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, ftruncateSync, readSync, writeSync } from 'node:fs';
import { inFolder, openRegular } from './safe-fs.mjs';

const MAX_BLOCKS = 3;

// The first 100 bytes of the file `name` of the working directory, or '' when it is missing or not a regular file.
function head(name) {
  let fd;
  try {
    fd = openRegular(name, constants.O_RDONLY);
    const text = Buffer.alloc(100);
    return text.toString('latin1', 0, readSync(fd, text, 0, 100, 0));
  } catch {
    return '';
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// Whether the stop for these violations may block, counting it when it does. `fallback` answers when the count could
// not be kept, where no block could be bounded, or when the session has no turn marker to count under.
export function mayBlock(root, folder, session, violations, fallback) {
  const fingerprint = createHash('sha256').update([...new Set(violations)].sort().join('\n')).digest('hex').slice(0, 16);
  try {
    const answer = inFolder(root, folder, true, () => {
      const turn = /^\d{1,20}/.exec(head(session))?.[0];
      // Without a turn marker no turn bounds the count, so the stop is answered as one that cannot keep its count.
      if (turn === undefined) return undefined;
      const [stored, ...seen] = head(`${session}.stop`).split('\n');
      const prior = stored === turn && seen.every((print) => /^[0-9a-f]{16}$/.test(print)) ? seen : [];
      if (prior.length >= MAX_BLOCKS || prior.includes(fingerprint)) return false;
      // Opened without truncating: a file with another hard link would carry the write to that other name, so only a
      // file this name alone holds is emptied and written; any other leaves the count unkept, as a failed save does.
      const fd = openRegular(`${session}.stop`, constants.O_WRONLY | constants.O_CREAT);
      try {
        if (fstatSync(fd).nlink !== 1) throw new Error('state file is linked elsewhere');
        ftruncateSync(fd, 0);
        writeSync(fd, [turn, ...prior, fingerprint].join('\n'));
      } finally {
        closeSync(fd);
      }
      return true;
    });
    return answer ?? fallback;
  } catch {
    return fallback;
  }
}
