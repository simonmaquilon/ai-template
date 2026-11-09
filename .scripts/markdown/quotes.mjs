// Open list items across blockquote depth changes for blocks.mjs: a quote that starts inside an open item (its
// marker at or past the item's content column) is part of that item, which `saved` keeps until a line leaves the
// quote; any other quote ends the open items. It never reads files or the environment.

// Returns null when the line stays in the same quote; otherwise the [stack, closed, entered] state of the line's
// blockquote depth q: the open items, the last item closed at each depth and whether the line opens a quote. A quote
// marker left of the content column of a saved item first leaves that item, so that the marker opens a new quote.
export function changeQuote(saved, stack, closed, quote, depth, q) {
  const marks = quote.match(/ {0,3}>[ \t]?/g) ?? [];
  const margin = (n) => marks[n].length - marks[n].trimStart().length;
  const cut = saved.findIndex((frame) => frame.depth < q && frame.stack.at(-1).col > margin(frame.depth));
  if (cut < 0 && q === depth) return null;
  if (cut >= 0) [depth, stack, closed, saved.length] = [saved[cut].depth, saved[cut].stack, saved[cut].closed, cut];
  if (q > depth) {
    while (stack.length && stack.at(-1).col > margin(depth)) closed[stack.at(-1).depth] = stack.pop();
    if (stack.length) saved.push({ depth, stack, closed });
    return [[], [], true];
  }
  while (saved.length && saved.at(-1).depth > q) saved.pop();
  const back = saved.at(-1)?.depth === q ? saved.pop() : null;
  return [back?.stack ?? [], back?.closed ?? [], false];
}
