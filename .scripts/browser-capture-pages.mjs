// The functions `capture` sends to the page with `eval`. Each one is a fixed text: nothing from the command line, from the
// project's values file or from the page itself is ever put into it, so what runs in the page is always what this file
// holds. They only collect boxes, styles and short texts, bounded in size; browser-capture-measure.mjs decides what counts
// as a finding. The texts are collapsed to one line each and never contain a comment.

const SHARED = `
const LIMIT = 5000;
const all = () => [...document.querySelectorAll('*')].slice(0, LIMIT);
const clean = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().slice(0, 40);
const name = (el) => (el.tagName.toLowerCase() + (el.id ? '#' + CSS.escape(el.id) : '')
  + (typeof el.className === 'string' ? el.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2).map((c) => '.' + CSS.escape(c)).join('') : '')).slice(0, 80);
const text = (el) => clean(el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt')
  || (/^(button|submit|reset)$/.test(el.type) ? el.getAttribute('value') : el.placeholder));
const visible = (el) => { const style = getComputedStyle(el); return style.display !== 'none' && style.visibility !== 'hidden'; };
`;

const page = (body) => `() => {${SHARED}${body}}`.replace(/\s*\n\s*/g, ' ');

export const PAGES = {
  viewport: '() => [window.innerWidth, window.innerHeight]',
  settle: 'async () => { await document.fonts?.ready; await new Promise((resolve) => setTimeout(resolve, 250)); return document.readyState; }',
  // Document width against the width of its viewport, and the elements that reach past it without a clipping ancestor.
  overflow: page(`
    const root = document.documentElement;
    const clientWidth = root.clientWidth;
    const clipped = (el) => { for (let p = el.parentElement; p && p !== root; p = p.parentElement) { if (getComputedStyle(p).overflowX !== 'visible') return true; } return false; };
    const wide = [];
    if (root.scrollWidth > clientWidth) {
      for (const el of all()) {
        const box = el.getBoundingClientRect();
        if (box.width > 0 && box.height > 0 && box.right > clientWidth + 1 && visible(el) && !clipped(el)) wide.push({ el, right: Math.round(box.right) });
      }
    }
    wide.sort((a, b) => b.right - a.right);
    const listed = wide.slice(0, 20).map(({ el, right }) => ({ selector: name(el), text: text(el), right }));
    return { clientWidth, scrollWidth: root.scrollWidth, wide: listed, wideCount: wide.length, truncated: document.querySelectorAll('*').length > LIMIT };
  `),
  // Boxes whose content is larger than they are while they hide it on that axis; the decision is made outside the page.
  clipped: page(`
    const hides = (value) => value === 'hidden' || value === 'clip';
    const found = [];
    for (const el of all()) {
      if (/^(input|textarea|select|iframe|video|canvas|img|svg)$/i.test(el.tagName)) continue;
      const wider = el.scrollWidth > el.clientWidth;
      const taller = el.scrollHeight > el.clientHeight;
      if (!wider && !taller) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (!(wider && hides(style.overflowX)) && !(taller && hides(style.overflowY))) continue;
      found.push({ selector: name(el), text: text(el), cw: el.clientWidth, sw: el.scrollWidth, ch: el.clientHeight, sh: el.scrollHeight,
        ox: style.overflowX, oy: style.overflowY, ellipsis: style.textOverflow === 'ellipsis',
        clamp: [style.webkitLineClamp, style.lineClamp].some((value) => value && value !== 'none') });
    }
    return { items: found.slice(0, 500), count: found.length, truncated: document.querySelectorAll('*').length > LIMIT };
  `),
  // Every visible interactive element with its size; the minimum is applied outside the page.
  targets: page(`
    const selector = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=menuitem], [role=option], [tabindex]:not([tabindex="-1"]), [contenteditable=""], [contenteditable=true]';
    const found = [];
    for (const el of document.querySelectorAll(selector)) {
      if (el.disabled || el.getAttribute('aria-disabled') === 'true' || !visible(el)) continue;
      const box = el.getBoundingClientRect();
      found.push({ selector: name(el), text: text(el), tag: el.tagName.toLowerCase(), w: Math.round(box.width * 10) / 10, h: Math.round(box.height * 10) / 10,
        inline: getComputedStyle(el).display === 'inline' });
    }
    return { items: found.slice(0, 2000), count: found.length };
  `),
  // The element that holds the focus and its style with and without it. The element is blurred and focused again with
  // its transitions off to read the style without focus, so its blur and focus handlers run once more.
  focus: page(`
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return { none: true };
    const props = ['outlineStyle', 'outlineWidth', 'outlineColor', 'outlineOffset', 'boxShadow', 'borderTopColor', 'backgroundColor', 'color', 'textDecorationLine'];
    const read = () => { const style = getComputedStyle(el); return Object.fromEntries(props.map((prop) => [prop, style[prop]])); };
    const before = el.style.getPropertyValue('transition');
    const priority = el.style.getPropertyPriority('transition');
    el.style.setProperty('transition', 'none', 'important');
    const focused = read();
    el.blur();
    const unfocused = read();
    el.focus({ preventScroll: true });
    if (before) el.style.setProperty('transition', before, priority); else el.style.removeProperty('transition');
    return { selector: name(el), text: text(el), focused, unfocused };
  `),
};
