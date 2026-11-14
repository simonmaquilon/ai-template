import assert from 'node:assert/strict';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { captureFixture } from './browser-capture-fixture.mjs';
import { WINDOWS } from './support.mjs';

const BASE = ['capture', '--name', 'shots', 'http://localhost:4173/'];
const VALUES = '.playwright/capture.config.json';

// Invalid input stops the launcher before it installs or runs anything, with a message that is not about approval.
function refuse(capture, args, reason) {
  const result = capture(args);
  assert.equal(result.status, 1, `${args.join(' ')}: ${result.stdout}`);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, reason, args.join(' '));
  assert.doesNotMatch(result.stderr, /approval/);
  assert.deepEqual(capture.calls(), [], 'nothing ran');
}

test('capture refuses invalid arguments without running anything', (t) => {
  const capture = captureFixture(t);
  const cases = [
    [['capture', 'http://localhost/'], /--name is required/], [['capture', '--name', 'shots'], /at least one URL/],
    [['capture', '--name', 'a/b', 'http://x/'], /--name/], [['capture', '--name', '..', 'http://x/'], /--name/],
    [['capture', '--name', 'a..b', 'http://x/'], /--name/], [['capture', '--name', 'x'.repeat(65), 'http://x/'], /--name/],
    [[...BASE, '--name', 'again'], /given once/], [[...BASE, '--filename=a.png'], /not an option of capture/],
    [[...BASE, '-x'], /option -x is not allowed/], [[...BASE, '--viewport'], /needs a value/],
    [['-s=../x', ...BASE], /session name/], [['-s', 'a b', ...BASE], /session name/],
    [['capture', '--name', 'shots', 'a b'], /not an http\(s\) address/], [['capture', '--name', 'shots', 'file:///etc/hosts'], /not an http/],
    [['capture', '--name', 'shots', 'javascript:alert(1)'], /not an http/], [['capture', '--name', 'shots', 'http://x/\nrun-code'], /not an http/],
    [[...BASE, '--viewport', '199x800'], /from 200 to 8000/], [[...BASE, '--viewport', '800x8001'], /from 200 to 8000/],
    [[...BASE, '--viewport', '800'], /<width>x<height>/], [[...BASE, '--viewport=1e3x800'], /<width>x<height>/],
    [[...BASE, '--scheme', 'blue'], /one of light, dark, no-preference/],
    [[...BASE, '--min-target', '0'], /from 1 to 200/], [[...BASE, '--min-target', '201'], /from 1 to 200/],
    [[...BASE, '--min-target', '1.5'], /--min-target/], [[...BASE, '--focus-steps', '51'], /from 1 to 50/],
    [[...BASE, '--focus-steps', '0'], /--focus-steps/],
  ];
  for (const [args, reason] of cases) refuse(capture, args, reason);
});

test('capture refuses more combinations than its limit', (t) => {
  const capture = captureFixture(t);
  const urls = ['http://a/', 'http://b/', 'http://c/', 'http://d/', 'http://e/'];
  // 5 URLs x 3 sizes x 2 schemes = 30
  refuse(capture, ['capture', '--name', 'big', ...urls, ...['500x500', '600x600', '700x700'].flatMap((size) => ['--viewport', size]),
    '--scheme', 'light', '--scheme', 'dark'], /30 combinations .* limit of 24/);
  refuse(capture, [...BASE, ...Array.from({ length: 9 }, (_, i) => `--viewport=${300 + i}x400`)], /at most 8 --viewport/);
});

test('capture refuses a values file that holds anything but its three keys or ranges', (t) => {
  const capture = captureFixture(t);
  const file = join(capture.dir, VALUES);
  const cases = [
    ['{"viewport":["800x600"]}', /has an unknown key/], ['{"viewports":"800x600"}', /"viewports" is a list/],
    ['{"viewports":[]}', /"viewports" is a list/], ['{"viewports":[800]}', /"viewports" holds an invalid value/],
    ['{"viewports":["100x100"]}', /"viewports" holds an invalid value/], ['{"viewports":["800x600","800x6"]}', /from 200 to 8000/],
    [`{"viewports":${JSON.stringify(Array(9).fill('800x600'))}}`, /1 to 8 values/], ['{"schemes":["sepia"]}', /"schemes" holds an invalid value/],
    ['{"minTarget":"24"}', /"minTarget" must be a number/], ['{"minTarget":24.5}', /"minTarget" is a whole number/],
    ['{"minTarget":0}', /from 1 to 200/], ['[]', /must hold a JSON object/], ['null', /must hold a JSON object/],
    ['{"minTarget":24', /not valid JSON/], [`{"minTarget":24,"x":"${'a'.repeat(5000)}"}`, /at most 4096 bytes/],
  ];
  for (const [text, reason] of cases) {
    writeFileSync(file, text);
    refuse(capture, BASE, reason);
  }
  // A value the arguments override is still read and refused: the file is checked whatever the arguments say.
  writeFileSync(file, '{"minTarget":0}');
  refuse(capture, [...BASE, '--min-target', '24'], /minTarget/);
  // A name that echoes nothing from the file.
  writeFileSync(file, `{"${'k'.repeat(100)}":1}`);
  const result = capture(BASE);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /has an unknown key/);
  assert.ok(!result.stderr.includes('kkk'), 'a key of the file is not repeated');
});

test('capture refuses a values file or a folder that is a symbolic link', { skip: WINDOWS }, (t) => {
  const capture = captureFixture(t);
  writeFileSync(join(capture.dir, 'elsewhere.json'), '{"minTarget":24}');
  symlinkSync(join(capture.dir, 'elsewhere.json'), join(capture.dir, VALUES));
  refuse(capture, BASE, /is a symbolic link/);
  rmSync(join(capture.dir, VALUES));
  mkdirSync(join(capture.dir, 'real'));
  writeFileSync(join(capture.dir, 'real', 'capture.config.json'), '{"minTarget":24}');
  rmSync(join(capture.dir, '.playwright'), { recursive: true });
  symlinkSync(join(capture.dir, 'real'), join(capture.dir, '.playwright'));
  refuse(capture, BASE, /is a symbolic link/);
});
