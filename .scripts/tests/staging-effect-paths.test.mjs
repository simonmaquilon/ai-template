import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { baseRepo, call } from './effect-support.mjs';

for (const client of ['claude', 'codex']) {
  test(`${client}: the effect hook names paths from undone directory changes, workdirs, and PowerShell assignments`, (t) => {
    const repo = baseRepo(t);
    for (const path of ['a.txt', 'b.txt', 'c.txt', 'pkg/keep.txt', 'src/w.ts', 'p.txt']) repo.write(path, `${path}\n`);
    const sub = join(repo.dir, 'pkg');
    const top = 'cd "$(git rev-parse --show-toplevel)" && git add a.txt && git commit -m a';
    const commitA = () => {
      repo.git('add', '--', 'a.txt');
      repo.git('commit', '-q', '-m', 'a');
    };
    assert.equal(call(client, repo, 'toplevel', top, commitA, sub).status, 0);
    assert.equal(call(client, repo, 'subshell', '(cd pkg && ls) && git add b.txt', () => repo.git('add', '--', 'b.txt')).status, 0);
    assert.equal(call(client, repo, 'pushd', 'pushd pkg; popd; git add c.txt', () => repo.git('add', '--', 'c.txt')).status, 0);
    assert.equal(call(client, repo, 'workdir', 'git add w.ts', () => repo.git('add', '--', 'src/w.ts')).status, 0);
    assert.equal(call(client, repo, 'assign', '$null = git add p.txt', () => repo.git('add', '--', 'p.txt')).status, 0);
    for (const path of ['app/pages/products/[id].vue', 'app/components/card.vue']) repo.write(path, `${path}\n`);
    const route = () => repo.git('add', '--', 'app/pages/products/[id].vue');
    assert.equal(call(client, repo, 'route', "git add 'pages/products/[id].vue'", route).status, 0);
    const glob = () => repo.git('add', '--', 'app/components/card.vue');
    assert.equal(call(client, repo, 'glob', "git add 'components/*.vue'", glob).status, 0);
    for (const path of ['pkg/.env.example', 'pkg/src/x.ts', 'q.txt']) repo.write(path, `${path}\n`);
    assert.equal(call(client, repo, 'dotfile', 'git add .env.example', () => repo.git('add', '--', 'pkg/.env.example')).status, 0);
    const bracket = '[ -f src/x.ts ] && git add src/x.ts';
    assert.equal(call(client, repo, 'bracket', bracket, () => repo.git('add', '--', 'pkg/src/x.ts'), sub).status, 0);
    const objects = Array.from({ length: 30 }, (_, i) => `{ input:'a${i}', expected:${i} }`).join(', ');
    const started = Date.now();
    assert.equal(call(client, repo, 'objects', `node -e "const cases=[${objects}]" && git add q.txt`, () => repo.git('add', '--', 'q.txt')).status, 0);
    assert.ok(Date.now() - started < 5000);
    for (const path of ['shared/util.ts', 'apps/api/x.ts', 'list/a.ts', 'list/b.ts', 'list/c.ts', 'list/d.ts', 'list/e.ts']) repo.write(path, `${path}\n`);
    assert.equal(call(client, repo, 'parent', 'git add ../../shared/util.ts', () => repo.git('add', '--', 'shared/util.ts')).status, 0);
    const pushed = 'Push-Location apps/web; git add ../api/x.ts';
    assert.equal(call(client, repo, 'push', pushed, () => repo.git('add', '--', 'apps/api/x.ts')).status, 0);
    const listed = () => repo.git('add', '--', 'list/a.ts', 'list/b.ts');
    assert.equal(call(client, repo, 'commas', "$files = 'list/a.ts', 'list/b.ts'; git add -- $files", listed).status, 0);
    const spaced = () => repo.git('add', '--', 'list/c.ts', 'list/d.ts');
    assert.equal(call(client, repo, 'spaced', 'files="list/c.ts list/d.ts"; git add $files', spaced).status, 0);
    repo.write('paths.txt', 'list/e.ts\n');
    const fromFile = 'git add --pathspec-from-file=paths.txt';
    assert.equal(call(client, repo, 'fromfile', fromFile, () => repo.git('add', '--pathspec-from-file=paths.txt')).status, 0);
  });
}
