import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { TOOL_VERSIONS } from '../tool-versions-file.mjs';
import { fixture } from './mobile-server-fixture.mjs';

const refused = (mobile, result, reason) => {
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '', 'nothing reached the protocol channel');
  assert.match(result.stderr, reason);
  assert.throws(() => mobile.npmCalls(), 'npm never ran');
};

test('mobile-server takes no argument but --check, and runs nothing for any other', (t) => {
  const mobile = fixture(t);
  for (const args of [['--help'], ['x'], ['--check', 'x'], ['--check', '--check'], ['--check=1'], ['']]) {
    refused(mobile, mobile(args, {}, 'hello\n'), /usage: node \.scripts\/mobile-server\.mjs \[--check\].*ran nothing/);
  }
});

test('mobile-server without a valid appium-mcp entry names the command that registers it, and runs nothing', (t) => {
  const add = /node \.scripts\/tool-versions\.mjs --add appium-mcp --repository https:\/\/github\.com\/appium\/appium-mcp.* outside the client sandbox/;
  const mobile = fixture(t);
  const write = (data) => writeFileSync(join(mobile.dir, TOOL_VERSIONS), data);
  const valid = readFileSync(join(mobile.dir, TOOL_VERSIONS), 'utf8');
  write(JSON.stringify({ other: {} }));
  refused(mobile, mobile(), /holds no valid appium-mcp entry \(it has none\)/);
  write(valid.replace('"1.2.3"', '"^1.0.0"'));
  refused(mobile, mobile(['--check']), /version is not an exact X\.Y\.Z version/);
  write(valid.replace('"license"', '"unknown":1,"license"'));
  refused(mobile, mobile(), add);
  write('{ not json');
  refused(mobile, mobile(), add);
  rmSync(join(mobile.dir, TOOL_VERSIONS));
  refused(mobile, mobile(), add);
});
