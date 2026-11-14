import assert from 'node:assert/strict';
import test from 'node:test';
import { block, fixture } from './stack-fixture.mjs';
import { entry } from './tool-versions-fixture.mjs';

const MARKED = block('template-tooling');
const FILE = '.agents/tool-versions.json';
const HEADER = '| Package | Version | Published | License | Origin | Retention | Notes |';
const SEPARATOR = '| --- | --- | --- | --- | --- | --- | --- |';

test('update-stack-doc generates the Template Tooling block from .agents/tool-versions.json and keeps its Notes', (t) => {
  const repo = fixture(t);
  repo.write(FILE, JSON.stringify({ zeta: entry({ license: 'Apache-2.0' }),
    alpha: entry({ version: '8.0.3', published: '2026-04-16T23:38:27.905Z', resolved: '2026-11-14T00:00:00.000Z', hold: '8', holdReason: 'a | b' }) }));
  repo.write('.docs/stack.md', `# Technology Stack\n\n${MARKED.replace('stale', `${HEADER}\n${SEPARATOR}\n| \`zeta\` | 0 | 0 | 0 | 0 | 0 | kept by hand |`)}\n`);
  const result = repo.sync();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /synced .*: template-tooling\./);
  assert.deepEqual(repo.stack().split('\n').filter((line) => line.startsWith('|')), [HEADER, SEPARATOR,
    '| `alpha` | 8.0.3 | 2026-04-16 | MIT | [o/r](https://github.com/o/r) | line 8: a \\| b | |',
    '| `zeta` | 1.0.0 | 2026-01-01 | Apache-2.0 | [o/r](https://github.com/o/r) | none | kept by hand |']);
  assert.equal(repo.sync().stdout, '', 'a second run changes nothing');
});

test('update-stack-doc leaves the block as it is when the file is invalid, and says it is not synced', (t) => {
  const repo = fixture(t);
  repo.write('.docs/stack.md', `${MARKED}\n`);
  repo.write(FILE, JSON.stringify({ tool: entry({ version: '^1.0.0' }) }));
  assert.match(repo.sync().stdout, /blocks not synced \(06-dependencies-and-stack\.md\): template-tooling;/);
  assert.match(repo.stack(), /\nstale\n/);
  repo.write(FILE, '{ not json');
  assert.match(repo.sync().stdout, /blocks not synced .*template-tooling/);
  repo.write(FILE, JSON.stringify({}));
  repo.sync();
  assert.match(repo.stack(), /_None found in \.agents\/tool-versions\.json\._/);
});
