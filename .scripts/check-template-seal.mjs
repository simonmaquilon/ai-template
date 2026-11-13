#!/usr/bin/env node
// Keeps the sealed template files of a derived project as the adopted release ships them (01-meta-guidelines.md).
// At every prompt it compares them with .agents/template-manifest.json, restores each that differs from its local
// blob, when the fetched release or the commit that recorded the manifest vouches for it, after saving the changed
// version under .temp/template-drift/<UTC>/; it reports the release's files the manifest leaves out, and checks that
// .claude/settings.json still registers the hooks the template's own settings register, unless the exceptions list
// names the hook's script. It prints plain text, which both clients add to the model's context, asking the agent to
// tell the user; it prints nothing when all is in order, in a checkout of the template, without a committed manifest,
// and in another repository, and never blocks a prompt.
// While .temp/template-adoption marks an adoption in progress it only says so. That marker is made by hand, and
//
//   node .scripts/check-template-seal.mjs --adoption-end
//
// removes it once the adopted manifest is committed and every sealed file matches it, or says what still differs and
// exits 1.

import { lstatSync, unlinkSync } from 'node:fs';
import { enterRepositoryRoot, git } from './hook-support.mjs';
import { MANIFEST, VERSION_FILE, listed, parseManifest, readText } from './template-files.mjs';
import { ADOPTING, EXCEPTIONS, isBlobId, readExceptions, sealState, sealedPairs } from './template-seal.mjs';
import { findDrift, unlisted, unvouched } from './template-seal-drift.mjs';
import { restore } from './template-seal-restore.mjs';

const HEAD = 'Template seal (01-meta-guidelines.md)';
const SETTINGS = '.claude/settings.json';
const SHOWN = 25;
const list = (value) => (Array.isArray(value) ? value : []);
const json = (text) => { try { return JSON.parse(text); } catch { return null; } };
const bullets = (lines) => [...lines.slice(0, SHOWN), ...(lines.length > SHOWN ? [`- and ${lines.length - SHOWN} more`] : [])];

// The template hooks this project's settings no longer register, as "event (matcher) script", or { error }. A
// project group counts when it holds the same command and covers every tool the template's matcher names.
function missingHooks(manifest, exceptions) {
  const id = manifest.files.get(SETTINGS);
  if (!id) return { missing: [] };
  const shipped = isBlobId(id) ? json(git(['cat-file', 'blob', id])) : null;
  if (!shipped) return { error: `the template's ${SETTINGS} (blob ${String(id).slice(0, 12)}) is not in the local git repository` };
  const own = json(readText(SETTINGS));
  if (!own || typeof own !== 'object') return { error: `cannot read ${SETTINGS}` };
  const tools = (matcher) => new Set(String(matcher ?? '').split('|'));
  const same = (a, b) => a?.type === b.type && a?.command === b.command && JSON.stringify(a?.args ?? []) === JSON.stringify(b.args ?? []);
  const missing = [];
  for (const [event, groups] of Object.entries(shipped.hooks ?? {})) {
    for (const group of list(groups)) {
      for (const hook of list(group.hooks)) {
        const script = /\.scripts\/[\w.-]+\.mjs/.exec(JSON.stringify(hook))?.[0];
        if (script && listed(exceptions, script)) continue;
        const covers = (mine) => [...tools(group.matcher)].every((tool) => tools(mine.matcher).has(tool));
        if (list(own.hooks?.[event]).some((mine) => covers(mine) && list(mine.hooks).some((h) => same(h, hook)))) continue;
        missing.push(`${event}${group.matcher ? ` (${group.matcher})` : ''} ${script?.slice('.scripts/'.length) ?? hook.command}`);
      }
    }
  }
  return { missing };
}

function prompt() {
  const state = sealState();
  if (state.mode === 'adopting') {
    return [`${HEAD}: a template adoption is in progress since ${state.since} (${ADOPTING} exists), so sealed template files `
      + 'are neither checked nor restored, and file tools may edit them. Remind the user; once the adoption is committed, '
      + 'end it with node .scripts/check-template-seal.mjs --adoption-end, as .readme/96-template-adoption.md shows.'];
  }
  if (state.mode === 'paused') return [`${HEAD}: ${state.why}, so sealed template files are not checked or restored until that is fixed; tell the user.`];
  if (state.mode !== 'active') return [];
  const out = [];
  const { results, folder } = restore(findDrift(state.sealed, state.manifest.version));
  if (results.length > 0) {
    out.push(`${HEAD}: these sealed template files differed from ${MANIFEST}, the record of the adopted release`
      + `${folder ? `; their changed versions are saved in ${folder}/` : ''}. Tell the user, in their language, which files were `
      + `restored and which were not; a deliberate change belongs in the template repository, or, with the user's approval, `
      + `in ${EXCEPTIONS} as the project's own.`, ...bullets(results.map(({ path, change, outcome }) => `- ${path}: ${change}; ${outcome}`)));
  }
  const left = unlisted(state.manifest);
  if (left.length > 0) {
    out.push(`${HEAD}: refs/plantilla/${state.manifest.version} ships files that ${MANIFEST} does not list: `
      + `${left.slice(0, SHOWN).join(', ')}${left.length > SHOWN ? `, and ${left.length - SHOWN} more` : ''}. The manifest may have `
      + 'been edited, so the seal does not guard them; tell the user.');
  }
  const hooks = missingHooks(state.manifest, state.exceptions);
  if (hooks.error) out.push(`${HEAD}: ${hooks.error}, so the template hooks it registers were not checked; tell the user.`);
  if (hooks.missing?.length > 0) {
    out.push(`${HEAD}: ${SETTINGS} no longer registers these template hooks: ${hooks.missing.join('; ')}. Tell the user, in their `
      + `language; restore them from the template's ${SETTINGS}, as .readme/92-agent-hooks.md lists them, or, if the project `
      + `drops one on purpose, record its script in ${EXCEPTIONS}.`);
  }
  return out;
}

function adoptionEnd() {
  const stop = (message) => {
    console.log(message);
    process.exit(1);
  };
  if (!lstatSync(ADOPTING, { throwIfNoEntry: false })) {
    console.log('No template adoption is in progress.');
    return;
  }
  const committedId = git(['rev-parse', '-q', '--verify', `HEAD:${MANIFEST}`])?.trim();
  if (!committedId || git(['hash-object', '--', MANIFEST])?.trim() !== committedId) stop(`${MANIFEST} is not committed as it is; commit the adoption first.`);
  const manifest = parseManifest(readText(MANIFEST));
  if (!manifest || manifest.version !== readText(VERSION_FILE)?.trim()) stop(`${MANIFEST} and ${VERSION_FILE} do not name the same release.`);
  const exceptions = readExceptions();
  if (exceptions.error) stop(`${EXCEPTIONS} is not valid (${exceptions.error}).`);
  const drift = findDrift(sealedPairs(manifest, exceptions.paths, committedId), manifest.version);
  if (drift.length > 0) {
    stop([`These sealed template files differ from the adopted ${MANIFEST}: take the release's version, or, with the user's `
      + `approval, record them in ${EXCEPTIONS}; then run this again.`, ...bullets(drift.map(({ path, change }) => `- ${path}: ${change}`))].join('\n'));
  }
  const loose = unvouched(sealedPairs(manifest, exceptions.paths, committedId), manifest.version);
  if (loose.length > 0) {
    stop([`Nothing would vouch for these sealed files after the adoption, so the seal could not restore them: commit them in `
      + `the same commit as ${MANIFEST}, as by amending it; then run this again.`, ...bullets(loose.map(({ path, untrusted }) => `- ${path}: ${untrusted}`))].join('\n'));
  }
  try {
    unlinkSync(ADOPTING);
  } catch (error) {
    stop(`Cannot remove ${ADOPTING} (${error.code ?? error.message}); remove it by hand.`);
  }
  console.log('Template adoption ended: the seal checks and restores the sealed template files again at every prompt.');
}

const ending = process.argv.includes('--adoption-end');
if (!enterRepositoryRoot()) {
  if (ending) {
    console.log('Not inside a git repository.');
    process.exit(1);
  }
  process.exit(0);
}
if (ending) adoptionEnd();
else {
  let out;
  try {
    out = prompt();
  } catch (error) {
    out = [`${HEAD}: could not check the sealed template files (${error.message}); tell the user.`];
  }
  if (out.length > 0) console.log(out.join('\n'));
}
