// The values of a capture run and their limits, shared by the command line and the project's own values file,
// .playwright/capture.config.json. Both are untrusted input for the launcher, which runs unconfined: a confined command
// may have written the file, so it is read strictly and anything unexpected stops the run before it starts.

import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const MAX_COMBINATIONS = 24; // URLs x sizes x color schemes in one run
export const MAX_LIST = 8;
export const SIDE = [200, 8000];
export const TARGET = [1, 200];
export const FOCUS = [1, 50];
export const SCHEMES = ['light', 'dark', 'no-preference'];
const FILE = '.playwright/capture.config.json';
const KEYS = ['viewports', 'schemes', 'minTarget'];
const MAX_BYTES = 4096;

// A text that came from the page, the CLI or the input, made safe to print: no control or text-direction characters.
export const safe = (text) => String(text).replace(/[\x00-\x1f\x7f-\x9f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '?');

export function viewport(value) {
  const match = /^([1-9]\d{0,4})x([1-9]\d{0,4})$/.exec(typeof value === 'string' ? value : '');
  const [width, height] = match ? [Number(match[1]), Number(match[2])] : [];
  if (![width, height].every((side) => side >= SIDE[0] && side <= SIDE[1])) {
    throw new Error(`a size is <width>x<height> with each side from ${SIDE[0]} to ${SIDE[1]}`);
  }
  return { label: `${width}x${height}`, width, height };
}

export function scheme(value) {
  if (!SCHEMES.includes(value)) throw new Error(`a color scheme is one of ${SCHEMES.join(', ')}`);
  return value;
}

export function integer(value, [min, max], what) {
  const number = typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${what} is a whole number from ${min} to ${max}`);
  return number;
}

function list(value, key, check) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LIST) {
    throw new Error(`${FILE}: "${key}" is a list of 1 to ${MAX_LIST} values`);
  }
  return value.map((item) => {
    try {
      return check(item);
    } catch (error) {
      throw new Error(`${FILE}: "${key}" holds an invalid value; ${error.message}`);
    }
  });
}

// The values the project declares, or {} when it has no file. It never echoes what the file holds. The file is opened
// once, without following a link or waiting on a pipe, and checked and read through that descriptor, so that swapping it
// between the check and the read changes nothing; at most MAX_BYTES + 1 bytes are read.
export function readValues(root) {
  const file = join(root, FILE);
  for (const path of [dirname(file), file]) {
    if (lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`${path} is a symbolic link; replace it with a regular file`);
  }
  const size = new Error(`${FILE} must be a regular file of at most ${MAX_BYTES} bytes`);
  let fd;
  try {
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw size;
  }
  let data;
  try {
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    const read = fstatSync(fd).isFile() ? readSync(fd, buffer, 0, buffer.length, 0) : buffer.length;
    if (read > MAX_BYTES) throw size;
    data = JSON.parse(buffer.toString('utf8', 0, read));
  } catch (error) {
    throw error === size ? size : new Error(`${FILE} is not valid JSON`);
  } finally {
    closeSync(fd);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${FILE} must hold a JSON object`);
  const unknown = Object.keys(data).find((key) => !KEYS.includes(key));
  if (unknown !== undefined) throw new Error(`${FILE} has an unknown key; it holds only ${KEYS.join(', ')}`);
  if (data.minTarget !== undefined && typeof data.minTarget !== 'number') throw new Error(`${FILE}: "minTarget" must be a number`);
  return {
    viewports: data.viewports === undefined ? undefined : list(data.viewports, 'viewports', viewport),
    schemes: data.schemes === undefined ? undefined : list(data.schemes, 'schemes', scheme),
    minTarget: data.minTarget === undefined ? undefined : integer(data.minTarget, TARGET, `${FILE}: "minTarget"`),
  };
}
