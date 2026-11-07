import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT } from './support.mjs';

const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'));
// Claude Code permission and exclusion patterns are globs over the command text, where * matches anything.
const matches = (pattern, command) =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(command);
const rules = (list, tool) => (list ?? []).filter((rule) => rule.startsWith(`${tool}(`)).map((rule) => rule.slice(tool.length + 1, -1));
const TOOLS = ['Bash', 'PowerShell'];

// The only gh patterns that may leave the sandbox or run without asking.
const READ_PATTERNS = [
  'gh repo view*', 'gh repo list*', 'gh pr view*', 'gh pr list*', 'gh pr diff*', 'gh pr checks*', 'gh run list*', 'gh run view*',
  'gh run watch*', 'gh workflow list*', 'gh workflow view*', 'gh issue view*', 'gh issue list*',
  'gh release list*', 'gh release view*', 'gh release verify*',
];
const ghOnly = (patterns) => patterns.filter((pattern) => pattern.startsWith('gh '));
const READS = [
  'gh repo view', 'gh repo view owner/name --json visibility', 'gh repo list', 'gh pr view 1', 'gh pr list', 'gh pr diff 1',
  'gh pr checks 1', 'gh run list', 'gh run view 1 --log', 'gh run watch 1', 'gh workflow list --all', 'gh workflow view checks.yml',
  'gh issue view 1', 'gh issue list', 'gh release list', 'gh release list --limit 5 --json tagName',
  'gh release view 1.0.0', 'gh release verify 1.0.0', 'gh release verify-asset 1.0.0 a.zip',
  // In gh run list, -w is --workflow, a filter; a lone -c, -v, or -y, or a w inside an argument, opens nothing.
  'gh run list -w checks.yml', 'gh run list --workflow checks.yml', 'gh run list -L 5 -w checks.yml', 'gh run list -aw checks.yml',
  'gh pr view 1 -c', 'gh pr view 1 --json reviews', 'gh run view 1 -v', 'gh workflow view checks.yml -y', 'gh repo view -b work',
];
const CHANGES = [
  'gh repo create x', 'gh repo delete x --yes', 'gh repo edit --visibility private', 'gh repo rename y', 'gh repo archive',
  'gh repo unarchive', 'gh repo fork', 'gh repo sync', 'gh repo deploy-key add k', 'gh repo autolink create', 'gh workflow run checks.yml',
  'gh api repos/x', 'gh release create 1.0.0', 'gh release delete 1.0.0 --yes', 'gh release delete-asset 1.0.0 a.zip',
  'gh release edit 1.0.0', 'gh release upload 1.0.0 a.zip', 'gh release download 1.0.0', 'gh release new 1.0.0',
  'gh release -R x/y delete 1.0.0 --yes', 'gh release --repo=x/y create 1.0.0', 'gh secret set X', 'gh pr merge 1', 'gh pr close 1', 'gh issue delete 1 --yes',
  'gh issue transfer 1 owner/other', 'gh run delete 1', 'gh cache delete key', 'gh label delete bug --yes', 'gh gist delete 1',
  'gh variable delete X',
  // Options before the command group, or between the group and its subcommand, still reach the subcommand.
  'gh -R x/y pr merge 1', 'gh --repo=x/y issue delete 1 --yes', 'gh -R x/y release delete 1.0.0 --yes', 'gh pr -R x/y merge 1',
  'gh pr -R x/y close 1', 'gh issue -R x/y delete 1', 'gh issue -R x/y transfer 1 owner/other', 'gh run -R x/y delete 1',
  'gh cache -R x/y delete key', 'gh label -R x/y delete bug', 'gh workflow -R x/y run checks.yml', 'gh variable -R x/y delete X',
  // Aliases, commands that overwrite or delete outside a repository, credentials, extensions, and gh aliases.
  'gh variable remove X', 'gh repo new x', 'gh variable set X', 'gh label clone owner/other --force', 'gh project delete 1',
  'gh codespace delete -c x', 'gh cs delete -c x', 'gh ssh-key delete 1', 'gh gpg-key delete k', 'gh auth token',
  'gh auth status --show-token', 'gh auth logout', 'gh extension install owner/gh-x', 'gh ext install owner/gh-x',
  'gh extensions exec x', 'gh extension upgrade --all', 'gh ext remove x', 'gh extension uninstall x', 'gh alias set m "pr merge"',
  'gh alias import aliases.yml', 'gh extensions install owner/gh-x', 'gh ext exec x', 'gh auth login',
  // A --flag=value before the subcommand reaches it in every group, also in those that reject -R there.
  'gh repo --yes=true delete x', 'gh gist --yes=true delete 1', 'gh project --owner=x delete 1', 'gh codespace -c x delete',
  'gh cs --all=true delete', 'gh ssh-key --yes=true delete 1', 'gh gpg-key --yes=true delete k',
  'gh alias --clobber=true set m "pr merge"', 'gh alias --clobber=true import aliases.yml',
  // Commands that install or run code, can print the token, or delete, close, or reach into projects and codespaces.
  'gh skill install owner/skills', 'gh skills update', 'gh skill publish', 'gh copilot suggest x',
  'gh config get -h github.com oauth_token', 'gh config set editor vim', 'gh project item-delete 1 --id x',
  'gh project field-delete --id x', 'gh project close 1', 'gh project unlink 1', 'gh codespace ssh -c x', 'gh cs cp a remote:b',
  'gh skill add owner/skills', 'gh skills add owner/skills', 'gh codespace cp a remote:b', 'gh cs ssh -c x',
];
// Read commands that open the browser.
const WEB = ['gh repo view --web', 'gh pr view 1 --web', 'gh issue list --web', 'gh release view 1.0.0 --web',
  // -w is --web in these commands, before or after the argument, and grouped with other short flags.
  'gh repo view -w', 'gh repo view owner/name -w', 'gh repo view -wb main', 'gh pr view -w 1', 'gh pr view 1 -w', 'gh pr view -cw 1',
  'gh pr view 1 -wc', 'gh pr list -w', 'gh pr list -L 5 -w', 'gh pr list -dw', 'gh pr list -wL 5', 'gh pr diff -w 1', 'gh pr diff 1 -w',
  'gh pr checks -w 1', 'gh pr checks 1 -w', 'gh run view -w 1', 'gh run view 1 -w', 'gh run view 1 -vw', 'gh workflow view -w checks.yml',
  'gh workflow view checks.yml -w', 'gh workflow view checks.yml -yw', 'gh issue view -w 1', 'gh issue view 1 -w', 'gh issue view 1 -cw',
  'gh issue list -w', 'gh issue list -l bug -w', 'gh release view -w 1.0.0', 'gh release view 1.0.0 -w',
];

test('the read-only gh commands run outside the Claude Code sandbox without asking', () => {
  assert.deepEqual(ghOnly(settings.sandbox.excludedCommands), READ_PATTERNS);
  for (const tool of TOOLS) assert.deepEqual(ghOnly(rules(settings.permissions.allow, tool)), READ_PATTERNS, tool);
  for (const command of READS) {
    assert.ok(settings.sandbox.excludedCommands.some((pattern) => matches(pattern, command)), command);
    for (const tool of TOOLS) {
      assert.ok(rules(settings.permissions.allow, tool).some((pattern) => matches(pattern, command)), `${tool} allow: ${command}`);
      assert.ok(!rules(settings.permissions.ask, tool).some((pattern) => matches(pattern, command)), `${tool} ask: ${command}`);
    }
  }
});

test('the gh commands that change a repository still ask, and no exclusion or allow rule reaches them', () => {
  for (const command of CHANGES) {
    assert.ok(!settings.sandbox.excludedCommands.some((pattern) => matches(pattern, command)), command);
    for (const tool of TOOLS) {
      assert.ok(rules(settings.permissions.ask, tool).some((pattern) => matches(pattern, command)), `${tool} ask: ${command}`);
      assert.ok(!rules(settings.permissions.allow, tool).some((pattern) => matches(pattern, command)), `${tool} allow: ${command}`);
    }
  }
});

test('a read-only gh command that opens the browser asks', () => {
  for (const command of WEB) {
    for (const tool of TOOLS) {
      assert.ok(rules(settings.permissions.ask, tool).some((pattern) => matches(pattern, command)), `${tool} ask: ${command}`);
    }
  }
});

// The template checks run without asking only as their own launcher; no other node command gains that.
test('the template checks run without asking, and that allow rule reaches no other node command', () => {
  for (const tool of TOOLS) {
    for (const command of ['node .scripts/run-checks.mjs', 'node .scripts/run-checks.mjs --base 2b2e8d6']) {
      assert.ok(rules(settings.permissions.allow, tool).some((pattern) => matches(pattern, command)), `${tool} allow: ${command}`);
      assert.ok(!rules(settings.permissions.ask, tool).some((pattern) => matches(pattern, command)), `${tool} ask: ${command}`);
    }
    for (const command of ['node .scripts/browser.mjs open', 'node .scripts/update-stack-doc.mjs', 'node -e 1', 'node run-checks.mjs',
      'node .scripts/run-checks.mjsx', 'node .scripts/run-checks.mjs.bak.mjs']) {
      assert.ok(!rules(settings.permissions.allow, tool).some((pattern) => matches(pattern, command)), `${tool} allow: ${command}`);
    }
  }
});

// A plain push only adds to the remote; these forms overwrite or delete what it holds.
const PUSHES = ['git push', 'git push origin main', 'git push -u origin feature', 'git push origin 2.4.0',
  'git -C sub push origin main', 'git push --follow-tags'];
const OVERWRITES = ['git push --force', 'git push -f origin main', 'git push origin main --force-with-lease',
  'git push origin +main', 'git push --delete origin old', 'git push origin -d old', 'git push --mirror',
  'git push --prune origin', 'git -C sub push --force origin main',
  // git accepts unambiguous prefixes of long options, and inline config can turn a plain push into a mirror.
  'git push --de origin old', 'git push --m', 'git push --pru origin', 'git -c remote.origin.mirror=true push',
  'git --config-env=remote.origin.mirror=MIRROR push'];

test('a plain git push runs without asking, and one that overwrites or deletes remote refs asks', () => {
  for (const tool of TOOLS) {
    for (const command of PUSHES) {
      assert.ok(!rules(settings.permissions.ask, tool).some((pattern) => matches(pattern, command)), `${tool} ask: ${command}`);
    }
    for (const command of OVERWRITES) {
      assert.ok(rules(settings.permissions.ask, tool).some((pattern) => matches(pattern, command)), `${tool} ask: ${command}`);
    }
  }
});

// Claude Code reads a trailing :* as its prefix syntax, so a rule that also uses * elsewhere never expands that *.
test('no permission rule mixes the * wildcard with the trailing :* prefix syntax', () => {
  for (const list of ['allow', 'ask', 'deny']) {
    for (const tool of TOOLS) {
      for (const pattern of rules(settings.permissions[list], tool)) {
        assert.ok(!(pattern.endsWith(':*') && pattern.slice(0, -2).includes('*')), `${tool} ${list}: ${pattern}`);
      }
    }
  }
});
