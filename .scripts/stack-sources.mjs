// Reads the facts that STACK.md mirrors from the files that pin them, as table
// rows whose first cell names the row. Values pass through clean() so that no
// credential, URL query or fragment, hash, commit SHA, or command argument
// reaches a document; no file that is itself a symlink is read, and no read
// leaves the repository, not even through a linked folder.

import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

const LOCKFILES = [['package-lock.json', 'npm'], ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lock', 'bun'], ['bun.lockb', 'bun']];
const ROLES = [['dependencies', 'production'], ['devDependencies', 'development'], ['optionalDependencies', 'optional'], ['peerDependencies', 'peer']];
const PACKAGE = /^(?:@[a-z0-9][\w.~-]*\/)?[a-z0-9][\w.~-]*$/i;
const HASH = /^[0-9a-f]{7,64}$/i;

// Whether a path, with every link on the way resolved, stays inside root.
function inside(root, full) {
  const local = relative(realpathSync(root), realpathSync(full));
  return local.split(sep)[0] !== '..' && !isAbsolute(local);
}

function text(root, path) {
  const full = join(root, path);
  if (!existsSync(full) || lstatSync(full).isSymbolicLink() || !inside(root, full)) return null;
  return readFileSync(full, 'utf8').replace(/^﻿/, '');
}

function json(root, path) {
  const content = text(root, path);
  return content === null ? null : JSON.parse(content);
}

// URLs keep their origin and path; other values lose any hash-like suffix.
export function clean(value) {
  const raw = String(value ?? 'unknown').trim();
  const url = /^(?:git\+)?([a-z][\w+.-]*:\/\/[^\s#]+)/i.exec(raw)?.[1];
  if (url) {
    try {
      const parsed = new URL(url);
      return `${parsed.origin === 'null' ? `${parsed.protocol}//${parsed.host}` : parsed.origin}${parsed.pathname}`;
    } catch {
      return 'unknown';
    }
  }
  const [base, ref] = raw.split('#');
  return ref !== undefined && HASH.test(ref) ? base : raw;
}

const command = (value) => {
  const first = String(value ?? '').trim().split(/\s+/)[0];
  return first && !first.includes('=') ? clean(first) : 'unknown';
};
const byName = (rows) => rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

export function runtime(root) {
  const rows = Object.entries(json(root, 'package.json')?.engines ?? {}).map(([name, range]) => [`package.json engines.${name}`, clean(range)]);
  for (const file of ['.nvmrc', '.node-version']) {
    const content = text(root, file)?.trim();
    if (content !== undefined) rows.push([file, /^[\w.*+/-]{1,32}$/.test(content) ? `node ${content}` : 'unrecognized']);
  }
  return byName(rows);
}

export function packageManager(root) {
  const declared = json(root, 'package.json')?.packageManager;
  const rows = [];
  if (typeof declared === 'string') {
    const [name, version = 'unknown'] = declared.split('+')[0].split('@');
    rows.push([clean(name), clean(version), 'package.json packageManager']);
  }
  for (const [file, name] of LOCKFILES) {
    if (existsSync(join(root, file)) && !rows.some((row) => row[0] === name)) rows.push([name, 'unknown', file]);
  }
  return byName(rows);
}

// Direct dependencies with the version and license installed in node_modules,
// which every Node package manager populates.
export function dependencies(root) {
  const manifest = json(root, 'package.json');
  if (!manifest) return null;
  const rows = [];
  for (const [field, role] of ROLES) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      const installed = PACKAGE.test(name) ? json(root, join('node_modules', name, 'package.json')) : null;
      const license = typeof installed?.license === 'string' ? installed.license : installed?.license?.type;
      rows.push([name, clean(range), clean(installed?.version ?? 'not installed'), role, clean(license ?? 'unknown')]);
    }
  }
  return byName(rows);
}

export function skills(root) {
  const locked = json(root, 'skills-lock.json')?.skills ?? {};
  const rows = Object.entries(locked).map(([name, entry]) => [name, clean(entry?.source), 'skills-lock.json']);
  const dir = join(root, '.agents', 'skills');
  for (const entry of existsSync(dir) && inside(root, dir) ? readdirSync(dir, { withFileTypes: true }) : []) {
    if (entry.isDirectory() && !locked[entry.name] && existsSync(join(dir, entry.name, 'SKILL.md'))) {
      rows.push([entry.name, 'this repository', 'none']);
    }
  }
  return byName(rows);
}

const endpoint = (server) => (typeof server?.url === 'string' ? clean(server.url) : command(server?.command));

export function mcpServers(root) {
  const servers = new Map();
  for (const [name, server] of Object.entries(json(root, '.mcp.json')?.mcpServers ?? {})) {
    servers.set(name, [name, 'yes', 'no', endpoint(server)]);
  }
  const toml = text(root, join('.codex', 'config.toml')) ?? '';
  for (const [, name, body] of toml.matchAll(/^\[mcp_servers\.([\w-]+)\][ \t]*(?:#[^\n]*)?\r?\n((?:(?!\[)[^\n]*\n?)*)/gm)) {
    const url = /^url[ \t]*=[ \t]*"([^"]*)"/m.exec(body)?.[1];
    const run = /^command[ \t]*=[ \t]*"([^"]*)"/m.exec(body)?.[1];
    const row = servers.get(name) ?? [name, 'no', 'yes', endpoint({ url, command: run })];
    row[2] = 'yes';
    servers.set(name, row);
  }
  return byName([...servers.values()]);
}

export function plugins(root) {
  const enabled = json(root, join('.claude', 'settings.json'))?.enabledPlugins ?? {};
  return byName(Object.entries(enabled).map(([id, on]) => {
    const [name, marketplace = 'unknown'] = id.split('@');
    return [name, marketplace, on ? 'yes' : 'no'];
  }));
}

// Actions show the release their pin comment names, never the pinned commit.
export function workflows(root) {
  const dir = join(root, '.github', 'workflows');
  if (!existsSync(dir) || !inside(root, dir)) return [];
  return byName(readdirSync(dir).filter((file) => /\.ya?ml$/.test(file)).map((file) => {
    const yaml = text(root, join('.github', 'workflows', file)) ?? '';
    const runners = new Set();
    for (const [, value] of yaml.matchAll(/^[ \t]*runs-on:[ \t]*([^\s#$[][^#\n]*)$/gm)) runners.add(value.trim());
    for (const [, list] of yaml.matchAll(/^[ \t]*os:[ \t]*\[([^\]\n]*)\]/gm)) list.split(',').forEach((os) => runners.add(os.trim()));
    const node = [...yaml.matchAll(/^[ \t]*node-version:[ \t]*['"]?([^'"\s#$[]+)/gm)].map((match) => match[1]);
    const actions = [...yaml.matchAll(/^[ \t]*(?:-[ \t]*)?uses:[ \t]*([\w.-]+\/[\w./-]+)@(\S+)(?:[ \t]*#[ \t]*(v?\d[\w.-]*))?/gm)]
      .map(([, action, ref, version]) => `${action} ${version ?? (HASH.test(ref) ? '(pinned by commit)' : clean(ref))}`);
    return [file, [...runners].join(', ') || 'none', [...new Set(node)].join(', ') || 'none', [...new Set(actions)].join(', ') || 'none'];
  }));
}
