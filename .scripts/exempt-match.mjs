// Whether a simple command matches one of the exemption patterns of the client settings, for the exempt-command hook
// (16-command-execution.md). The patterns follow the syntax of a permission rule: * matches any text, a pattern
// ending in " *" also matches the command with no arguments, and one with no * matches exactly.
export function isExempt(patterns, command) {
  return patterns.some((pattern) => {
    const spaced = pattern.endsWith(' *');
    const source = (spaced ? pattern.slice(0, -2) : pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${source}${spaced ? '(?: .*)?' : ''}$`, 's').test(command);
  });
}
