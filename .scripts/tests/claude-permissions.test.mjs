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
const WEB = ['gh repo view --web', 'gh pr view 1 --web', 'gh issue list --web', 'gh release view 1.0.0 --web'];

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
