// Runs a capture plan (browser-capture-args.mjs) in an open browser session through the commands of the Playwright CLI
// that browser.mjs passes in as `cli`, each with --raw so that only its result or error comes back: for each URL, size and color scheme, it resizes, emulates the scheme, navigates,
// takes a full-page screenshot and measures the page with the fixed functions of browser-capture-pages.mjs. The
// screenshots and report.json go to .temp/playwright-cli/<name>/, the output folder the sandbox protects. A run that
// finishes is a success whatever it finds: measuring is not approving.

import { lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAGES } from './browser-capture-pages.mjs';
import { clippedContent, consoleErrors, focusStep, focusWalk, horizontalOverflow, smallTargets } from './browser-capture-measure.mjs';

export { isCapture, planCapture } from './browser-capture-args.mjs';
export { safe } from './browser-capture-values.mjs';

const OUTPUT = ['.temp', 'playwright-cli'];
const NOTES = [
  'Sizes are the browser viewport resized to the given width and height: no device pixel ratio, touch or mobile user agent.',
  'A color scheme is emulated with the prefers-color-scheme media feature, not the real switch of the application; no-preference clears the emulation.',
  'Container overflow records the measured scroll axes. Use the layout and its behavior to decide whether scrolling is intended.',
  'clipped: a heuristic from computed styles; a deliberate crop, such as a carousel track, cannot be told from a defect.',
  'targets: each element is measured by its own box, without its label or the spacing around it; links flowing in a line of text are left out.',
  'focus: a heuristic; it compares computed styles with and without focus, and runs the blur and focus handlers of each element once more.',
];

const isLink = (path) => lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink();
const slug = ({ label } = {}, scheme) => `${label ?? 'current'}-${scheme ?? 'default'}`;

function prepare(root, name) {
  const dir = join(root, ...OUTPUT, name);
  const paths = [join(root, OUTPUT[0]), join(root, ...OUTPUT), dir, join(dir, 'report.json')];
  const link = paths.find(isLink);
  if (link) throw new Error(`${link} is a symbolic link; replace it with a regular file or folder`);
  mkdirSync(dir, { recursive: true });
  // What an earlier run with this name left is removed first, so that no stale screenshot or report passes for this run's.
  for (const entry of readdirSync(dir)) {
    if (/^(report\.json|u\d+-[\w-]+\.png)$/.test(entry)) rmSync(join(dir, entry), { force: true });
  }
  return dir;
}

function omitted(plan) {
  const list = [];
  if (plan.viewports.length === 0) list.push('viewports: none declared by the project or the run; one capture at the current size');
  if (plan.schemes.length === 0) list.push('schemes: none declared by the project or the run; no color scheme emulation');
  if (plan.minTarget === undefined) list.push('min-target: not declared by the project or the run; the size of interactive targets was not checked');
  if (plan.focusSteps === undefined) list.push('focus-steps: not requested; the keyboard focus was not walked');
  return list;
}

export function runCapture(plan, cli, root) {
  const dir = prepare(root, plan.name);
  const prefix = plan.session === undefined ? [] : [`-s=${plan.session}`];
  const call = (...args) => {
    const result = cli([...prefix, '--raw', ...args]);
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    if (result.error || result.status !== 0) {
      const hint = /not open/i.test(output) ? ' (open the session first: node .scripts/browser.mjs [-s=<session>] open about:blank)' : '';
      throw new Error(`${args[0]} failed: ${(output.split('\n')[0] || result.error?.message).slice(0, 200)}${hint}`);
    }
    return result.stdout ?? '';
  };
  const page = (fn) => {
    try {
      return JSON.parse(call('eval', fn));
    } catch (error) {
      throw error instanceof SyntaxError ? new Error('eval returned no JSON') : error;
    }
  };
  const measure = (fn) => {
    try {
      return fn();
    } catch (error) {
      return { error: String(error.message).slice(0, 200) };
    }
  };
  const left = omitted(plan);
  // The size comes from the page, which can make it anything: it is used to restore the session only as two whole numbers.
  const reported = plan.viewports.length > 0 ? page(PAGES.viewport) : undefined;
  const original = Array.isArray(reported) && reported.length === 2 && reported.every((side) => Number.isInteger(side) && side >= 1 && side <= 16384) ? reported : undefined;
  if (reported && !original) left.push('restore: the page did not report a usable window size; the session keeps the last size of the run');
  const results = [];
  try {
    plan.urls.forEach((url, index) => {
      for (const size of plan.viewports.length > 0 ? plan.viewports : [undefined]) {
        for (const scheme of plan.schemes.length > 0 ? plan.schemes : [undefined]) {
          const file = `${OUTPUT.join('/')}/${plan.name}/u${index + 1}-${slug(size, scheme)}.png`;
          if (size) call('resize', String(size.width), String(size.height));
          if (scheme) call(...(scheme === 'no-preference' ? ['clear-color-scheme'] : ['set-color-scheme', scheme]));
          call('goto', url);
          page(PAGES.settle);
          const result = { url, viewport: size?.label ?? null, scheme: scheme ?? null, screenshot: file };
          result.overflow = measure(() => horizontalOverflow(page(PAGES.overflow)));
          result.clipped = measure(() => clippedContent(page(PAGES.clipped)));
          if (plan.minTarget !== undefined) result.targets = measure(() => smallTargets(page(PAGES.targets), plan.minTarget));
          result.console = measure(() => consoleErrors(call('console', 'error')));
          call('screenshot', '--full-page', `--filename=${file}`);
          if (plan.focusSteps !== undefined) {
            result.focus = measure(() => {
              const steps = [];
              for (let step = 0; step < plan.focusSteps; step++) {
                call('press', 'Tab');
                steps.push(focusStep(page(PAGES.focus)));
                if (steps.at(-1).none) break;
              }
              return focusWalk(steps);
            });
          }
          results.push(result);
        }
      }
    });
  } finally {
    // Leave the session as it was: no emulation, and the size it had.
    if (plan.schemes.length > 0) measure(() => call('clear-color-scheme'));
    if (original) measure(() => call('resize', String(original[0]), String(original[1])));
  }
  const report = { name: plan.name, session: plan.session ?? 'default', declaredBy: plan.from, omitted: left, notes: NOTES, results };
  writeFileSync(join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  summarize(plan, results, left);
}

const count = (measured) => (measured === undefined ? '-' : measured.error ? 'error' : measured.count);

function summarize(plan, results, left) {
  for (const r of results) {
    const containerOverflow = r.overflow.error ? 'error' : (r.overflow.containers?.horizontalCount ?? '-');
    console.log(`${r.screenshot} ${r.url}  ${r.viewport ?? 'current-size'} ${r.scheme ?? 'no-emulation'}  overflow=${count(r.overflow)} clipped=${count(r.clipped)} `
      + `small-targets=${count(r.targets)} console-errors=${count(r.console)} focus-without-style-change=${count(r.focus)} container-overflow-x=${containerOverflow}`);
  }
  console.log(`report: ${OUTPUT.join('/')}/${plan.name}/report.json (findings do not change the exit status; "-" is not measured, "error" is in the report)`);
  for (const line of left) console.log(`omitted: ${line}`);
}
