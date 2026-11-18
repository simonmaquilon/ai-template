// What counts as a finding, decided from the plain data the page functions of browser-capture-pages.mjs return, so that
// each rule is tested without a browser. A measure returns { count, ... } with the findings, at most MAX_LISTED of them
// listed. Texts and selectors come from the page: they are data for the report, never read as instructions.

export const MAX_LISTED = 20;
const TOLERANCE = 1; // px: scroll and client sizes are rounded
const HIDES = new Set(['hidden', 'clip']);
const FOCUS_PROPS = ['outlineStyle', 'outlineWidth', 'outlineColor', 'outlineOffset', 'boxShadow', 'borderTopColor', 'backgroundColor',
  'color', 'textDecorationLine'];

const number = (value) => typeof value === 'number' && Number.isFinite(value);

// The axes on which a box hides content that is larger than it, leaving out boxes of 1px or less (hidden, or the
// visually-hidden idiom), a single line cut with an ellipsis, and a block of lines cut by a line clamp.
export function clippedAxes(box) {
  if (!(box.cw > TOLERANCE) || !(box.ch > TOLERANCE)) return [];
  const axes = [];
  if (HIDES.has(box.ox) && box.sw - box.cw > TOLERANCE && !box.ellipsis) axes.push('x');
  if (HIDES.has(box.oy) && box.sh - box.ch > TOLERANCE && !box.clamp) axes.push('y');
  return axes;
}

export function horizontalOverflow(data) {
  if (![data.clientWidth, data.scrollWidth, data.wideCount].every(number)) throw new Error('unexpected overflow data');
  const overflows = data.scrollWidth - data.clientWidth > TOLERANCE;
  const result = { count: overflows ? 1 : 0, clientWidth: data.clientWidth, scrollWidth: data.scrollWidth, elementCount: data.wideCount,
    elements: overflows ? data.wide.slice(0, MAX_LISTED) : [], truncated: data.truncated === true };
  if (data.containers !== undefined) {
    const { count, horizontalCount, elements, truncated } = data.containers;
    if (!Number.isInteger(count) || !Number.isInteger(horizontalCount) || horizontalCount < 0 || count < horizontalCount || !Array.isArray(elements)) {
      throw new Error('unexpected container overflow data');
    }
    result.containers = { count, horizontalCount, truncated: truncated === true || count > MAX_LISTED, elements: elements.slice(0, MAX_LISTED) };
  }
  return result;
}

export function clippedContent(data) {
  const found = data.items.map((box) => ({ box, axes: clippedAxes(box) })).filter(({ axes }) => axes.length > 0);
  return { count: found.length, truncated: data.truncated === true || data.count > data.items.length,
    elements: found.slice(0, MAX_LISTED).map(({ box, axes }) => ({ selector: box.selector, text: box.text, axes,
      hiddenBy: { x: Math.max(0, box.sw - box.cw), y: Math.max(0, box.sh - box.ch) } })) };
}

// Interactive elements smaller than `min` on either side. Left out: boxes of 1px or less, and links that flow inside
// a line of text (display: inline), which the WCAG target size rule exempts.
export function smallTargets(data, min) {
  const measured = data.items.filter((item) => item.w > 0 && item.h > 0 && (item.w > 1 || item.h > 1));
  const inline = measured.filter((item) => item.inline && item.tag === 'a');
  const small = measured.filter((item) => !(item.inline && item.tag === 'a') && (item.w < min || item.h < min));
  return { count: small.length, min, checked: measured.length - inline.length, excludedInlineLinks: inline.length,
    truncated: data.count > data.items.length,
    elements: small.slice(0, MAX_LISTED).map(({ selector, text, w, h }) => ({ selector, text, width: w, height: h })) };
}

// The text `console error` returns: a header with the totals, an empty line, then one line per message.
export function consoleErrors(output) {
  const header = /^Total messages: \d+ \(Errors: (\d+), Warnings: \d+\)/m.exec(output);
  if (!header) throw new Error('unexpected console output');
  const lines = output.slice(header.index + header[0].length).split('\n').map((line) => line.trim()).filter(Boolean)
    .filter((line) => !line.startsWith('Returning '));
  return { count: Number(header[1]), messages: lines.slice(0, MAX_LISTED).map((line) => line.slice(0, 300)) };
}

// One step of the keyboard walk. Whether the style changed with focus is a heuristic: a focus indicator drawn some other
// way, or a style that changes through something other than the properties compared, is not seen.
export function focusStep(data) {
  if (data.none) return { none: true };
  const changed = FOCUS_PROPS.filter((prop) => data.focused?.[prop] !== data.unfocused?.[prop]);
  return { selector: data.selector, text: data.text, changedStyle: changed };
}

export function focusWalk(steps) {
  const walked = steps.filter((step) => !step.none);
  return { heuristic: true, count: walked.filter((step) => step.changedStyle.length === 0).length, visited: walked.length,
    completedCycle: steps.some((step) => step.none), steps: steps.slice(0, MAX_LISTED * 5) };
}
