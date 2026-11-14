import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { checkArgs } from '../browser-args.mjs';
import { PAGES } from '../browser-capture-pages.mjs';
import { QUIET, captureFixture, tree } from './browser-capture-fixture.mjs';
import { WINDOWS } from './support.mjs';

const OUT = '.temp/playwright-cli';
const evalOf = (fn) => ['eval', fn];
const report = (capture, name) => JSON.parse(readFileSync(join(capture.dir, OUT, name, 'report.json'), 'utf8'));

test('capture without declared values takes one screenshot per URL, emulates nothing, and says what it left out', (t) => {
  const capture = captureFixture(t);
  const before = tree(capture.dir);
  const result = capture(['-s=shots', 'capture', '--name', 'plain', 'http://localhost:4173/a', 'about:blank']);
  assert.equal(result.status, 0, result.stderr);
  const run = (url, n) => [['goto', url], evalOf(PAGES.settle), evalOf(PAGES.overflow), evalOf(PAGES.clipped), ['console', 'error'],
    ['screenshot', '--full-page', `--filename=${OUT}/plain/u${n}-current-default.png`]];
  assert.deepEqual(capture.calls(), [...run('http://localhost:4173/a', 1), ...run('about:blank', 2)].map((call) => ['-s=shots', '--raw', ...call]));
  for (const call of capture.calls()) checkArgs(call, capture.dir);
  const saved = report(capture, 'plain');
  assert.equal(saved.session, 'shots');
  assert.equal(saved.omitted.length, 4);
  for (const part of ['viewports', 'schemes', 'min-target', 'focus-steps']) assert.ok(saved.omitted.some((line) => line.startsWith(`${part}:`)), part);
  assert.deepEqual(saved.results.map((r) => [r.viewport, r.scheme, 'targets' in r, 'focus' in r]), [[null, null, false, false], [null, null, false, false]]);
  assert.ok(saved.notes.some((note) => /emulated with the prefers-color-scheme/.test(note)));
  assert.match(result.stdout, /u1-current-default\.png http:\/\/localhost:4173\/a {2}current-size no-emulation {2}overflow=0 clipped=0 small-targets=- console-errors=0/);
  assert.match(result.stdout, /omitted: min-target: not declared/);
  // Everything it wrote is in the output folder of the run (the log is the stand-in CLI's own).
  const added = tree(capture.dir).filter((path) => !before.includes(path) && path !== 'cli.log').sort();
  assert.deepEqual(added, [`${OUT}/plain/report.json`, `${OUT}/plain/u1-current-default.png`, `${OUT}/plain/u2-current-default.png`]);
});

test('capture takes its values from the project file, and the arguments win over them', (t) => {
  const capture = captureFixture(t);
  writeFileSync(join(capture.dir, '.playwright', 'capture.config.json'), '{"viewports":["390x844","1280x800"],"schemes":["light","dark"],"minTarget":44}');
  const fromFile = capture(['capture', '--name', 'declared', 'http://localhost:4173/'], { answers: QUIET });
  assert.equal(fromFile.status, 0, fromFile.stderr);
  const emulation = capture.calls().filter((call) => ['resize', 'set-color-scheme', 'clear-color-scheme'].includes(call[1])).map((call) => call.slice(1).join(' '));
  assert.deepEqual(emulation, ['resize 390 844', 'set-color-scheme light', 'resize 390 844', 'set-color-scheme dark', 'resize 1280 800',
    'set-color-scheme light', 'resize 1280 800', 'set-color-scheme dark', 'clear-color-scheme', 'resize 1024 768']);
  assert.deepEqual(report(capture, 'declared').declaredBy, { viewports: '.playwright/capture.config.json', schemes: '.playwright/capture.config.json', minTarget: '.playwright/capture.config.json' });
  assert.ok(capture.calls().some((call) => call.at(-1) === PAGES.targets), 'minTarget from the file measures the targets');

  const log = capture.calls().length;
  const args = capture(['capture', '--name', 'argued', 'http://localhost:4173/', '--viewport', '800x600', '--scheme=no-preference', '--min-target', '24', '--focus-steps', '2']);
  assert.equal(args.status, 0, args.stderr);
  const calls = capture.calls().slice(log);
  assert.deepEqual(calls.filter((call) => call.at(-2) !== 'eval' && call.at(-2) !== 'console').map((call) => call.slice(1).join(' ')), ['resize 800 600', 'clear-color-scheme',
    'goto http://localhost:4173/', `screenshot --full-page --filename=${OUT}/argued/u1-800x600-no-preference.png`, 'press Tab',
    'clear-color-scheme', 'resize 1024 768']);
  assert.equal(calls.filter((call) => call.at(-1) === PAGES.targets).length, 1);
  assert.deepEqual(report(capture, 'argued').declaredBy, { viewports: 'arguments', schemes: 'arguments', minTarget: 'arguments' });
  for (const call of capture.calls()) checkArgs(call, capture.dir);
});

test('capture reports each finding and still exits 0', (t) => {
  const capture = captureFixture(t);
  const answers = {
    ...QUIET,
    [PAGES.overflow]: '{"clientWidth":390,"scrollWidth":640,"wide":[{"selector":"div.wide","text":"x","right":640}],"wideCount":1}',
    [PAGES.clipped]: '{"items":[{"selector":"div.box","text":"t","cw":100,"sw":160,"ch":20,"sh":20,"ox":"hidden","oy":"visible"}],"count":1}',
    [PAGES.targets]: '{"items":[{"selector":"a.tiny","text":"x","tag":"a","w":12,"h":12,"inline":false},{"selector":"button","text":"ok","tag":"button","w":48,"h":48}],"count":2}',
    [PAGES.focus]: '{"selector":"a","text":"x","focused":{"outlineStyle":"none"},"unfocused":{"outlineStyle":"none"}}',
    console: 'Total messages: 3 (Errors: 2, Warnings: 1)\nReturning 2 messages for level "error"\n\n[ERROR] boom @ http://x/a.js:1\n[ERROR] bang @ http://x/b.js:2\n',
  };
  const result = capture(['capture', '--name', 'found', 'http://localhost:4173/', '--min-target', '24', '--focus-steps', '2'], { answers });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /overflow=1 clipped=1 small-targets=1 console-errors=2 focus-without-style-change=2/);
  const [saved] = report(capture, 'found').results;
  assert.deepEqual(saved.targets.elements, [{ selector: 'a.tiny', text: 'x', width: 12, height: 12 }]);
  assert.equal(saved.console.messages.length, 2);
  assert.equal(saved.focus.heuristic, true);
});

test('capture stops with a status other than 0 when a command fails, and leaves the session as it found it', (t) => {
  const capture = captureFixture(t);
  const result = capture(['capture', '--name', 'broken', 'http://localhost:4173/', '--scheme', 'dark', '--viewport', '800x600'],
    { env: { FAKE_FAIL: 'goto', FAKE_FAIL_TEXT: "The browser 'default' is not open, please run open first" } });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /goto failed: The browser 'default' is not open, please run open first \(open the session first: node \.scripts\/browser\.mjs/);
  assert.doesNotMatch(result.stderr, /approval/);
  assert.deepEqual(capture.calls().slice(-2).map((call) => call.slice(1).join(' ')), ['clear-color-scheme', 'resize 1024 768']);
  const failing = capture(['capture', '--name', 'broken', 'http://localhost:4173/'], { env: { FAKE_FAIL: 'screenshot' } });
  assert.equal(failing.status, 1);
  assert.match(failing.stderr, /screenshot failed: failed/);
});

test('capture restores no size the page made up, and a failed run leaves no report or screenshot of an earlier one', (t) => {
  const capture = captureFixture(t);
  const args = ['capture', '--name', 'again', 'http://localhost:4173/', '--viewport', '800x600'];
  const result = capture(args, { answers: { ...QUIET, [PAGES.viewport]: '["-s=x","--help"]' } });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(capture.calls().filter((call) => call.includes('resize')).map((call) => call.slice(1).join(' ')), ['resize 800 600']);
  assert.ok(report(capture, 'again').omitted.some((line) => line.startsWith('restore:')));
  const folder = join(capture.dir, '.temp', 'playwright-cli', 'again');
  assert.deepEqual(tree(folder).sort(), ['report.json', 'u1-800x600-default.png']);
  assert.equal(capture(args, { env: { FAKE_FAIL: 'goto' } }).status, 1);
  assert.deepEqual(tree(folder), []);
});

test('capture prints no control or text-direction character from a failing command, and refuses one in a URL', (t) => {
  const capture = captureFixture(t);
  const failing = capture(['capture', '--name', 'marks', 'http://localhost:4173/'], { env: { FAKE_FAIL: 'goto', FAKE_FAIL_TEXT: 'bad\u001b[31m\u202etext' } });
  assert.equal(failing.status, 1);
  assert.match(failing.stderr, /goto failed: bad\?\[31m\?text/);
  for (const mark of ['\u007f', '\u0085', '\u202e']) {
    const refused = capture(['capture', '--name', 'marks', `http://localhost:4173/${mark}`]);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /is not an http\(s\) address/);
    assert.doesNotMatch(refused.stderr, /[\u007f-\u009f\u202e]/);
  }
});

test('capture puts no value of the input in what it evaluates in the page', (t) => {
  const capture = captureFixture(t);
  const result = capture(['-s=sessionMark', 'capture', '--name', 'nameMark', 'http://localhost:4173/?q=urlMark', '--viewport', '801x601', '--min-target', '37', '--focus-steps', '1']);
  assert.equal(result.status, 0, result.stderr);
  const texts = capture.calls().filter((call) => call.includes('eval')).map((call) => call.at(-1));
  assert.ok(texts.length >= 5);
  for (const text of texts) {
    assert.ok(Object.values(PAGES).includes(text), 'an eval text that is not one of the fixed functions');
    assert.doesNotMatch(text, /urlMark|nameMark|sessionMark|801|601|\b37\b/);
  }
});

test('capture refuses an output folder that is a symbolic link', { skip: WINDOWS }, (t) => {
  const capture = captureFixture(t);
  mkdirSync(join(capture.dir, OUT), { recursive: true });
  mkdirSync(join(capture.dir, 'elsewhere'));
  symlinkSync(join(capture.dir, 'elsewhere'), join(capture.dir, OUT, 'linked'));
  const result = capture(['capture', '--name', 'linked', 'about:blank']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is a symbolic link/);
  assert.deepEqual(capture.calls(), []);
  assert.deepEqual(tree(join(capture.dir, 'elsewhere')), []);
});
