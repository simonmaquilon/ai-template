import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT } from './support.mjs';

// JSON with comments: drops // and /* */ comments outside strings, so a "//" inside a string survives.
function parseJsonc(text) {
  let out = '', i = 0, string = false;
  while (i < text.length) {
    const c = text[i], two = text.slice(i, i + 2);
    if (string) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') string = false;
      i++;
    } else if (two === '//') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (two === '/*') {
      i = text.indexOf('*/', i + 2) + 2 || text.length;
    } else {
      out += c;
      string = c === '"';
      i++;
    }
  }
  return JSON.parse(out);
}

const config = parseJsonc(readFileSync(join(ROOT, '.markdownlint-cli2.jsonc'), 'utf8'));

// The rule ids the engine can emit: each quoted 'MDnnn' in its sources.
function engineRules() {
  const scripts = join(ROOT, '.scripts', 'markdown');
  const sources = readdirSync(scripts).filter((name) => name.endsWith('.mjs'));
  return new Set(sources.flatMap((name) => [...readFileSync(join(scripts, name), 'utf8').matchAll(/'(MD\d{3})'/g)].map((m) => m[1])));
}

test('markdown editor config: the rules enabled for the editor are exactly the rules the engine implements', () => {
  const engine = engineRules();
  assert.ok(engine.size > 0, 'the engine sources name no rule');
  assert.equal(config.config.default, false);
  const enabled = Object.keys(config.config).filter((key) => key !== 'default' && config.config[key] !== false);
  assert.deepEqual(enabled.sort(), [...engine].sort());
});

test('markdown editor config: the skills left out of the silence are exactly those .gitattributes holds to markdown-structure', () => {
  const attributes = readFileSync(join(ROOT, '.gitattributes'), 'utf8');
  const marked = [...attributes.matchAll(/^\.agents\/skills\/([^/\s]+)\/\*\* markdown-structure$/gm)].map((m) => m[1]);
  assert.ok(marked.length > 0, '.gitattributes marks no skill markdown-structure');
  const [silence] = config.overrides;
  assert.equal(config.overrides.length, 1);
  assert.equal(silence.combine, 'replace');
  assert.deepEqual(silence.config, { default: false });
  assert.equal(silence.filter[0], '.agents/skills/**');
  const kept = silence.filter.slice(1).map((glob) => /^!\.agents\/skills\/([^/]+)\/\*\*$/.exec(glob)?.[1]);
  assert.deepEqual(kept.sort(), marked.sort());
});
