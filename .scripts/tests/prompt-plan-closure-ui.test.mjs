import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { horizontalOverflow, smallTargets } from '../browser-capture-measure.mjs';
import { PAGES } from '../browser-capture-pages.mjs';
import { ROOT, run } from './support.mjs';

const RULES = [
  '.agents/instructions/07-interface.md',
  '.agents/skills/prompt/references/coding-and-ui-prompts.md',
];

test('finding 20: repository instructions and generated-prompt guidance require every new-view check', () => {
  for (const path of RULES) {
    const rules = readFileSync(join(ROOT, path), 'utf8');
    const view = rules.split('\n').find((line) => /For (a )?new views? (or|and) dialogs?/.test(line)) ?? '';
    assert.match(view, /component resolution (by compiling|at build time)/, path);
    assert.match(view, /actual content scroller by selector and scroll and client dimensions/, path);
    assert.match(view, /focus .*trigger disappears or (the|a) dialog closes/, path);
    assert.match(view, /success feedback after the flow reloads its data/, path);
    assert.match(view, /first load from (a )?fresh state/, path);
    assert.match(rules, /44 by 44 CSS pixels/, path);
    assert.match(rules, /project's (touch )?target size/, path);
  }
});

test('finding 20: native component import fails when missing and resolves when present', (t) => {
  const scratch = join(ROOT, '.temp');
  mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(join(scratch, 'closure-ui-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'view.mjs'), "import { Panel } from './panel.mjs';\nprocess.stdout.write(Panel());\n");
  const load = () => run(process.execPath, ['view.mjs'], { cwd: dir, timeout: 10000 });
  const unresolved = load();
  assert.equal(unresolved.status, 1, unresolved.stderr);
  assert.match(unresolved.stderr, /ERR_MODULE_NOT_FOUND.*panel\.mjs/);
  writeFileSync(join(dir, 'panel.mjs'), "export const Panel = () => 'Order panel';\n");
  const resolved = load();
  assert.equal(resolved.status, 0, resolved.stderr);
  assert.equal(resolved.stdout, 'Order panel');
});

function element(tagName, id, width, height, extra = {}) {
  return {
    tagName, id, clientWidth: width, scrollWidth: width, clientHeight: height, scrollHeight: height,
    getAttribute: () => null, getBoundingClientRect: () => ({ width, height }), ...extra,
  };
}

// The flow uses a mocked DOM and in-memory data so the checks can distinguish the negative and positive fixtures.
function viewFixture(faults, previousRows) {
  const body = element('BODY', '', 390, 844);
  const documentElement = element('HTML', '', 390, 844);
  const scroller = element('SECTION', 'dialog-content', 320, 180, {
    scrollHeight: 420, scrollWidth: faults.includes('scroll') ? 520 : 320,
    computed: { overflowX: 'auto', overflowY: 'auto' },
  });
  const save = element('BUTTON', 'save', faults.includes('touch') ? 43 : 44, 44);
  const row = element('BUTTON', 'order-row', 80, 44);
  const document = {
    body, documentElement, activeElement: save,
    querySelectorAll: (selector) => (selector === '*' ? [body, scroller, save, row] : [save, row]),
  };
  const context = {
    document, CSS: { escape: (value) => value },
    getComputedStyle: (el) => ({ display: 'block', visibility: 'visible', ...el.computed }),
  };
  const measure = (name) => runInNewContext(`(${PAGES[name]})()`, context);
  let stored = 'Original order';
  let rows = previousRows ?? (faults.includes('first-load') ? [] : [stored]);
  let notice;
  return {
    measure,
    rows: () => rows,
    notice: () => notice,
    active: () => document.activeElement.id,
    saveAndReload() {
      stored = 'Updated order';
      notice = 'Saved';
      document.activeElement = faults.includes('focus') ? body : row;
      rows = [stored];
      if (faults.includes('notice')) notice = undefined;
    },
  };
}

function findings(view) {
  const results = [];
  if (view.rows()[0] !== 'Original order') results.push('first-load');
  const overflow = horizontalOverflow(view.measure('overflow'));
  assert.equal(overflow.count, 0, 'document-level measurements cannot detect the inner scroller fault');
  const scroller = overflow.containers.elements.find(({ selector }) => selector === 'section#dialog-content');
  assert.ok(scroller, 'the actual content scroller must be found by selector');
  assert.equal(scroller.clientHeight, 180);
  assert.equal(scroller.scrollHeight, 420);
  if (scroller.scrollWidth > scroller.clientWidth) results.push('scroll');
  const touch = smallTargets(view.measure('targets'), 44);
  if (touch.count !== 0) {
    assert.equal(touch.elements[0].selector, 'button#save');
    assert.equal(touch.elements[0].width, 43);
    assert.equal(touch.elements[0].height, 44);
    results.push('touch');
  }
  view.saveAndReload();
  assert.deepEqual(view.rows(), ['Updated order']);
  if (view.active() !== 'order-row') results.push('focus');
  if (view.notice() !== 'Saved') results.push('notice');
  return results;
}

test('finding 20: view verification detects each simulated runtime fault independently and together', () => {
  const faults = ['first-load', 'scroll', 'touch', 'focus', 'notice'];
  for (const fault of faults) assert.deepEqual(findings(viewFixture([fault])), [fault]);
  assert.deepEqual(findings(viewFixture(faults)), faults);
  assert.deepEqual(findings(viewFixture([])), []);
  assert.deepEqual(findings(viewFixture(['first-load'], ['Original order'])), [], 'warm state masks the first-load fault');
});
