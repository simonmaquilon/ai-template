// Ordinary work in a project derived from the template: the commands and edits a project makes every day pass every
// PreToolUse and PostToolUse hook its client registers, which neither blocks, denies, asks, nor says anything.

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { derivedProject, fire, hookEnv, read, toolCall } from './derived-project-fixture.mjs';

const quiet = (results, label) => assert.deepEqual(results.map(({ script, verdict }) => `${script}: ${verdict}`),
  results.map(({ script }) => `${script}: silent`), label);

for (const client of ['claude', 'codex']) {
  test(`${client}: everyday commands and edits pass the hooks before and after the tool`, async (t) => {
    const repo = derivedProject(t);
    const env = hookEnv(t, repo, client);
    assert.equal(repo.script('update-stack-doc.mjs').status, 0, 'the stack is synchronized before a project works');
    repo.write('src/app.js', 'console.log(1);\n');
    repo.git('add', '--', 'src/app.js');
    assert.equal(repo.git('commit', '-q', '-m', 'app').status, 0);
    const title = read(repo, 'README.md').split('\n')[0];
    const work = [
      ['git add src/app.js', toolCall(repo, client, 'shell', 'git add src/app.js'), () => repo.git('add', '--', 'src/app.js')],
      ['git commit -m "x"', toolCall(repo, client, 'shell', 'git commit -m "x"'), () => {}],
      ['npm test', toolCall(repo, client, 'shell', 'npm test'), () => {}],
      ['echo hi > .temp/out.txt', toolCall(repo, client, 'shell', 'echo hi > .temp/out.txt'), () => repo.write('.temp/out.txt', 'hi\n')],
      ['Write src/app.js', toolCall(repo, client, 'write', 'console.log(2);', 'src/app.js'), () => repo.write('src/app.js', 'console.log(2);\n')],
      ['Edit README.md', toolCall(repo, client, 'edit', title, 'README.md'),
        () => writeFileSync(join(repo.dir, 'README.md'), read(repo, 'README.md').replace(title, `${title} x`))],
    ];
    for (const [label, call, effect] of work) {
      quiet(await fire(repo, client, env, 'PreToolUse', call), `before ${label}`);
      effect();
      quiet(await fire(repo, client, env, 'PostToolUse', call), `after ${label}`);
    }
  });
}
