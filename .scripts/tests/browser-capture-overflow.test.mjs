import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { PAGES } from '../browser-capture-pages.mjs';
import { QUIET, captureFixture } from './browser-capture-fixture.mjs';

test('capture saves nested overflow and keeps the viewport overflow count independent', (t) => {
  const capture = captureFixture(t);
  const item = { selector: 'div#dialog-body', dialog: false, clientWidth: 280, scrollWidth: 510, clientHeight: 200, scrollHeight: 450, axes: ['x', 'y'] };
  const containers = { count: 1, horizontalCount: 1, truncated: false, elements: [item] };
  const result = capture(['capture', '--name', 'nested', 'http://localhost:4173/'], { answers: {
    ...QUIET,
    [PAGES.overflow]: JSON.stringify({ clientWidth: 390, scrollWidth: 390, wide: [], wideCount: 0, containers }),
  } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /overflow=0.*container-overflow-x=1/);
  const saved = JSON.parse(readFileSync(join(capture.dir, '.temp', 'playwright-cli', 'nested', 'report.json'), 'utf8'));
  assert.deepEqual(saved.results[0].overflow.containers, containers);
});
