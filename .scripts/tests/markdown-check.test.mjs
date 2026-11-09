import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { postToolContext } from './hook-context.mjs';
import { hookFor, makeRepo, runClientHook, startRepo } from './support.mjs';

const HEAD = 'Markdown structure (10-documents.md): fix the listed warnings on the lines the change touched.';
const SPACES = 'Trailing spaces [Expected: 0 or 2; Actual: 3]';
const STAR = 'Unordered list style [Expected: dash; Actual: asterisk]';
const lint = (client, repo, toolInput, cwd = repo.dir) => postToolContext(runClientHook(client,
  hookFor(client, 'PostToolUse', 'check-markdown.mjs'), repo,
  { cwd, input: { cwd, hook_event_name: 'PostToolUse', tool_input: toolInput } }));

for (const client of ['claude', 'codex']) {
  test(`markdown check: ${client} reports only the lines an edit changed in a committed file`, (t) => {
    const repo = startRepo(t, { 'docs/x.md': '# A\n\n* old\n\ntext\n' });
    repo.git('config', 'diff.interHunkContext', '10');
    repo.write('docs/x.md', '# A   \n\n* old\n\ntext   \n\n');
    assert.equal(lint(client, repo, { file_path: 'docs/x.md' }), [HEAD, `docs/x.md:1 [MD009] ${SPACES}`, `docs/x.md:5 [MD009] ${SPACES}`,
      'docs/x.md:7 [MD012] Multiple consecutive blank lines [Expected: 1; Actual: 2]'].join('\n'));
  });

  test(`markdown check: ${client} reports every line of an untracked file`, (t) => {
    const repo = startRepo(t);
    repo.write('docs/new.md', '# A\n\na   \n\n* b\n');
    assert.equal(lint(client, repo, { file_path: 'docs/new.md' }),
      [HEAD, `docs/new.md:3 [MD009] ${SPACES}`, `docs/new.md:5 [MD004] ${STAR}`].join('\n'));
  });

  test(`markdown check: ${client} skips ignored, vendored, generated, external, non-Markdown and missing files`, (t) => {
    const repo = makeRepo(t);
    const external = makeRepo(t);
    external.write('x.md', '* a\n');
    repo.write('.gitattributes', 'vendor/** linguist-vendored\ngenerated/** linguist-generated\n');
    for (const file of ['.temp/x.md', 'vendor/x.md', 'generated/x.md', 'x.txt']) repo.write(file, '* a\n');
    for (const file of ['.temp/x.md', 'vendor/x.md', 'generated/x.md', join(external.dir, 'x.md'), 'x.txt', 'missing.md']) {
      assert.equal(lint(client, repo, { file_path: file }), '', file);
    }
  });

  test(`${client}: the hook checks a template-authored skill marked markdown-structure`, (t) => {
    const repo = makeRepo(t);
    repo.write('.gitattributes', 'vendor/** linguist-vendored\ngenerated/** linguist-generated\n' +
      'vendor/own/** markdown-structure\ngenerated/own/** markdown-structure\n');
    for (const file of ['vendor/own/o.md', 'generated/own/g.md']) repo.write(file, '# A\n\n* a\n');
    for (const file of ['vendor/own/o.md', 'generated/own/g.md']) {
      assert.equal(lint(client, repo, { file_path: file }), `${HEAD}\n${file}:3 [MD004] ${STAR}`, file);
    }
  });

  test(`${client}: the hook never checks a file marked -markdown-structure`, (t) => {
    const repo = makeRepo(t);
    repo.write('.gitattributes', 'plain/** -markdown-structure\n');
    repo.write('plain/p.md', '* a\n');
    assert.equal(lint(client, repo, { file_path: 'plain/p.md' }), '');
  });

  test(`${client}: the hook skips a new skill under .agents/skills without markdown-structure`, (t) => {
    const repo = makeRepo(t);
    repo.write('.gitattributes', '.agents/skills/** linguist-vendored\n.agents/skills/own/** markdown-structure\n');
    repo.write('.agents/skills/new/SKILL.md', '* a\n');
    assert.equal(lint(client, repo, { file_path: '.agents/skills/new/SKILL.md' }), '');
  });
}

test('markdown check: an apply_patch input resolves its paths from a subdirectory', (t) => {
  const repo = makeRepo(t);
  repo.write('docs/x.md', '# A\n\n* a\n');
  const patch = '*** Begin Patch\n*** Update File: x.md\n*** End Patch';
  assert.equal(lint('codex', repo, { command: patch }, join(repo.dir, 'docs')), `${HEAD}\ndocs/x.md:3 [MD004] ${STAR}`);
});

test('markdown check: past 20 warnings the hook shows 20 and counts the rest', (t) => {
  const repo = makeRepo(t);
  repo.write('long.md', `# A\n\n${'x   \n'.repeat(25)}`);
  const lines = lint('claude', repo, { file_path: 'long.md' }).split('\n');
  assert.deepEqual(lines.slice(1, 21), Array.from({ length: 20 }, (_, i) => `long.md:${i + 3} [MD009] ${SPACES}`));
  assert.deepEqual(lines.slice(21),
    ['5 more warnings not shown; `node .scripts/check-markdown.mjs <file>` lists every warning in a file.']);
});

test('markdown check: the hook reports oversized files and skips binary ones', (t) => {
  const repo = makeRepo(t);
  repo.write('large.md', '* a\n' + 'a'.repeat(1024 * 1024));
  repo.write('binary.md', '\0* a\n');
  assert.equal(lint('claude', repo, { file_path: 'large.md' }), `${HEAD}\nlarge.md: not checked; size limit exceeded.`);
  assert.equal(lint('claude', repo, { file_path: 'binary.md' }), '');
});

test('markdown check: manual mode lints whole files and sets the exit status', (t) => {
  const repo = startRepo(t, { 'docs/x.md': '# A\n\n* old\n', 'docs/clean.md': '# A\n' });
  repo.write('docs/x.md', '# A\n\n* old\n\ntext   \n');
  const dirty = `docs/x.md:3 [MD004] ${STAR}\ndocs/x.md:5 [MD009] ${SPACES}\n`;
  for (const [args, status, stdout] of [[['docs/x.md'], 1, dirty], [['docs/clean.md'], 0, ''], [[], 2, ''],
    [['missing.md'], 2, ''], [['docs/x.md', 'missing.md'], 1, dirty]]) {
    const result = repo.script('check-markdown.mjs', args);
    const complains = args.length === 0 || args.includes('missing.md');
    assert.deepEqual([result.status, result.stdout, result.stderr !== ''], [status, stdout, complains], args.join(' '));
  }
});
