import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_LISTED, clippedAxes, clippedContent, consoleErrors, focusStep, focusWalk, horizontalOverflow, smallTargets } from '../browser-capture-measure.mjs';

const box = (extra) => ({ selector: 'div.card', text: 'Title', cw: 100, sw: 100, ch: 40, sh: 40, ox: 'visible', oy: 'visible', ellipsis: false, clamp: false, ...extra });

test('a box is clipped on the axis where it hides content larger than itself', () => {
  assert.deepEqual(clippedAxes(box({ sw: 160, ox: 'hidden' })), ['x']);
  assert.deepEqual(clippedAxes(box({ sh: 90, oy: 'clip' })), ['y']);
  assert.deepEqual(clippedAxes(box({ sw: 160, ox: 'hidden', sh: 90, oy: 'hidden' })), ['x', 'y']);
});

test('a box is not clipped when it shows its overflow, rounds, truncates on purpose, or is hidden', () => {
  for (const [why, extra] of [['overflow visible', { sw: 160 }], ['scrolls', { sw: 160, ox: 'auto' }], ['rounding', { sw: 101, ox: 'hidden' }],
    ['ellipsis', { sw: 160, ox: 'hidden', ellipsis: true }], ['line clamp', { sh: 90, oy: 'hidden', clamp: true }],
    ['zero size', { cw: 0, sw: 160, ox: 'hidden' }], ['visually hidden', { cw: 1, ch: 1, sw: 160, ox: 'hidden' }]]) {
    assert.deepEqual(clippedAxes(box(extra)), [], why);
  }
  // An ellipsis cuts one line, not the height, and a clamp cuts the height, not the width.
  assert.deepEqual(clippedAxes(box({ sw: 160, ox: 'hidden', ellipsis: true, sh: 90, oy: 'hidden' })), ['y']);
  assert.deepEqual(clippedAxes(box({ sw: 160, ox: 'hidden', clamp: true, sh: 90, oy: 'hidden' })), ['x']);
});

test('clippedContent counts every finding and lists a bounded number', () => {
  const items = Array.from({ length: 30 }, (_, i) => box({ selector: `p.n${i}`, sw: 200, ox: 'hidden' })).concat(box({ ellipsis: true, sw: 200, ox: 'hidden' }));
  const found = clippedContent({ items, count: 31 });
  assert.equal(found.count, 30);
  assert.equal(found.elements.length, MAX_LISTED);
  assert.deepEqual(found.elements[0], { selector: 'p.n0', text: 'Title', axes: ['x'], hiddenBy: { x: 100, y: 0 } });
  assert.equal(found.truncated, false);
  assert.equal(clippedContent({ items, count: 600 }).truncated, true);
});

test('the document overflows when it is wider than its viewport by more than rounding', () => {
  const wide = [{ selector: 'img', text: '', right: 900 }];
  assert.deepEqual(horizontalOverflow({ clientWidth: 390, scrollWidth: 900, wide, wideCount: 1 }),
    { count: 1, clientWidth: 390, scrollWidth: 900, elementCount: 1, elements: wide, truncated: false });
  assert.equal(horizontalOverflow({ clientWidth: 390, scrollWidth: 391, wide, wideCount: 1 }).count, 0);
  assert.deepEqual(horizontalOverflow({ clientWidth: 390, scrollWidth: 391, wide, wideCount: 1 }).elements, []);
  assert.throws(() => horizontalOverflow({ clientWidth: '390', scrollWidth: 400, wideCount: 0 }), /unexpected overflow data/);
});

test('a target is small when either side is under the minimum, with the exemptions it states', () => {
  const item = (selector, w, h, extra) => ({ selector, text: selector, tag: 'button', w, h, inline: false, ...extra });
  const data = { count: 7, items: [item('wide', 100, 23), item('tall', 23, 100), item('exact', 24, 24), item('big', 48, 48), item('zero', 0, 0),
    item('hidden-idiom', 1, 1), item('inline-link', 30, 14, { tag: 'a', inline: true }), item('block-link', 30, 14, { tag: 'a' })] };
  const found = smallTargets(data, 24);
  assert.deepEqual(found.elements.map((e) => e.selector), ['wide', 'tall', 'block-link']);
  assert.deepEqual([found.count, found.min, found.checked, found.excludedInlineLinks], [3, 24, 5, 1]);
  assert.deepEqual(found.elements[0], { selector: 'wide', text: 'wide', width: 100, height: 23 });
  assert.equal(smallTargets(data, 44).count, 4, 'the minimum is the one given');
});

test('the console errors come from the header totals and the message lines', () => {
  const text = 'Total messages: 5 (Errors: 2, Warnings: 3)\nReturning 2 messages for level "error"\n\n[ERROR] a @ http://x:1\n  [ERROR] b @ http://x:2\n';
  assert.deepEqual(consoleErrors(text), { count: 2, messages: ['[ERROR] a @ http://x:1', '[ERROR] b @ http://x:2'] });
  assert.deepEqual(consoleErrors('Total messages: 0 (Errors: 0, Warnings: 0)\n\n'), { count: 0, messages: [] });
  assert.throws(() => consoleErrors('something else'), /unexpected console output/);
});

test('a focus step lists the properties that changed, and the walk counts the steps with none', () => {
  const ring = { selector: 'a', text: 'Home', focused: { outlineStyle: 'auto', color: 'red' }, unfocused: { outlineStyle: 'none', color: 'red' } };
  const flat = { selector: 'button', text: 'Go', focused: { outlineStyle: 'none' }, unfocused: { outlineStyle: 'none' } };
  assert.deepEqual(focusStep(ring), { selector: 'a', text: 'Home', changedStyle: ['outlineStyle'] });
  assert.deepEqual(focusStep({ none: true }), { none: true });
  const walk = focusWalk([focusStep(ring), focusStep(flat), focusStep({ none: true })]);
  assert.deepEqual([walk.heuristic, walk.count, walk.visited, walk.completedCycle], [true, 1, 2, true]);
});
