import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { PAGES } from '../browser-capture-pages.mjs';

// A page of plain objects with the few properties the functions read.
function element(tag, extra = {}) {
  const attributes = extra.attributes ?? {};
  return { tagName: tag.toUpperCase(), id: '', className: '', innerText: '', scrollWidth: 0, clientWidth: 0, scrollHeight: 0, clientHeight: 0, parentElement: null,
    box: { width: 0, height: 0, right: 0 }, style: {}, ...extra, getAttribute: (name) => attributes[name] ?? null, getBoundingClientRect() { return this.box; } };
}

function run(name, elements, { active, root } = {}) {
  const rootElement = root ?? element('html', { clientWidth: 400, scrollWidth: 400 });
  const context = {
    CSS: { escape: (value) => value }, window: { innerWidth: 400, innerHeight: 800 },
    document: { documentElement: rootElement, activeElement: active, body: element('body'), fonts: { ready: Promise.resolve() }, readyState: 'complete',
      querySelectorAll: (selector) => (selector === '*' ? elements : elements.filter((e) => e.interactive)) },
    getComputedStyle: (el) => ({ display: 'block', visibility: 'visible', overflowX: 'visible', overflowY: 'visible', textOverflow: 'clip', ...el.computed }),
    Object, Promise, setTimeout,
  };
  return JSON.parse(JSON.stringify(runInNewContext(`(${PAGES[name]})()`, context)));
}

test('every page function is one line, holds no comment, and parses as a function', () => {
  for (const [name, text] of Object.entries(PAGES)) {
    assert.doesNotMatch(text, /\n/, name);
    assert.doesNotMatch(text, /\/\/|\/\*/, name);
    assert.doesNotThrow(() => new Function(`return (${text})`), name);
  }
});

test('the overflow function lists the elements that reach past the viewport without a clipping ancestor', () => {
  const root = element('html', { clientWidth: 400, scrollWidth: 700 });
  const track = element('div', { className: 'track', computed: { overflowX: 'auto' } });
  const inside = element('img', { box: { width: 300, height: 50, right: 900 }, parentElement: track });
  const wide = element('div', { id: 'hero', className: 'hero big extra', innerText: '  A  wide\n block ', box: { width: 600, height: 50, right: 700 }, parentElement: root });
  const hidden = element('div', { box: { width: 600, height: 50, right: 800 }, computed: { display: 'none' } });
  const found = run('overflow', [root, track, inside, wide, hidden], { root });
  assert.deepEqual(found, { clientWidth: 400, scrollWidth: 700, wideCount: 1, truncated: false, wide: [{ selector: 'div#hero.hero.big', text: 'A wide block', right: 700 }] });
  assert.deepEqual(run('overflow', [wide]).wide, [], 'a document that does not overflow lists nothing');
});

test('the clipped function returns only boxes that hide an overflowing axis, and skips form controls', () => {
  const card = element('div', { className: 'card', innerText: 'Long', clientWidth: 100, scrollWidth: 160, clientHeight: 20, scrollHeight: 20, computed: { overflowX: 'hidden', textOverflow: 'ellipsis' } });
  const plain = element('div', { clientWidth: 100, scrollWidth: 160, clientHeight: 20, scrollHeight: 20 });
  const field = element('input', { clientWidth: 100, scrollWidth: 160, clientHeight: 20, scrollHeight: 20, computed: { overflowX: 'hidden' } });
  assert.deepEqual(run('clipped', [card, plain, field]), { count: 1, truncated: false, items: [{ selector: 'div.card', text: 'Long', cw: 100, sw: 160, ch: 20, sh: 20,
    ox: 'hidden', oy: 'visible', ellipsis: true, clamp: false }] });
});

test('the targets function returns the visible, enabled interactive elements with their size and display', () => {
  const link = element('a', { interactive: true, innerText: 'Docs', box: { width: 30.04, height: 14.6, right: 0 }, computed: { display: 'inline' } });
  const field = element('input', { interactive: true, attributes: { placeholder: 'x' }, placeholder: 'Search', box: { width: 200, height: 40, right: 0 } });
  const off = element('button', { interactive: true, disabled: true });
  const none = element('button', { interactive: true, computed: { display: 'none' } });
  assert.deepEqual(run('targets', [link, field, off, none]).items, [
    { selector: 'a', text: 'Docs', tag: 'a', w: 30, h: 14.6, inline: true }, { selector: 'input', text: 'Search', tag: 'input', w: 200, h: 40, inline: false }]);
});

test('the focus function reads the style with and without focus and puts the element and its transition back', () => {
  const log = [];
  const el = element('button', { innerText: 'Go', computed: { outlineStyle: 'auto' } });
  el.style = { getPropertyValue: () => '', getPropertyPriority: () => '', setProperty: (k, v) => log.push(`set ${k} ${v}`), removeProperty: (k) => log.push(`remove ${k}`) };
  el.blur = () => { el.computed.outlineStyle = 'none'; log.push('blur'); };
  el.focus = (options) => { el.computed.outlineStyle = 'auto'; log.push(`focus ${JSON.stringify(options)}`); };
  const found = run('focus', [el], { active: el });
  assert.equal(found.focused.outlineStyle, 'auto');
  assert.equal(found.unfocused.outlineStyle, 'none');
  assert.deepEqual(log, ['set transition none', 'blur', 'focus {"preventScroll":true}', 'remove transition']);
  assert.deepEqual(run('focus', [], { active: undefined }), { none: true });
});
