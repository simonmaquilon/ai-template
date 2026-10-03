// Heuristic leads for the edit hook, not vulnerability verdicts. Never return
// source text or captured values; contextual validation belongs to the agent.
const RULES = [
  ['html-injection', /\b(?:innerHTML|outerHTML)\s*=|\bv-html\s*=/, 'Check untrusted HTML and contextual sanitization.'],
  ['dynamic-evaluation', /\beval\s*\(/, 'Check whether untrusted input reaches dynamic evaluation.'],
  ['dynamic-construction', /\bnew\s+Function\s*\(/, 'Check whether untrusted input constructs executable code.'],
  ['interpolated-query', /\b(?:query|execute|prepare)\s*\(\s*`[^`]*\$\{/, 'Check query parameterization and input ownership.'],
  ['shell-input', /\b(?:exec|execSync)\s*\(\s*(?:`[^`]*\$\{|(?:req|request|input|payload|params|body)\b)/, 'Check shell input and argument-safe process APIs.'],
  ['unsafe-deserialization', /\b(?:pickle\.loads?|yaml\.load)\s*\(/, 'Check the input trust level and safe parser options.'],
  ['disabled-tls-verification', /\brejectUnauthorized\s*:\s*false\b|\bNODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/, 'Check disabled transport certificate verification.'],
  ['credential-literal', /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|secret)\s*[:=]\s*(['"])[^'"\r\n]{8,}\1/i, 'Check a possible credential literal without displaying its value.'],
];

export function securityLeads(text, limit = 20) {
  const leads = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(?:\/\/|#|\/\*|\*|<!--)/.test(lines[i])) continue;
    for (const [id, pattern, message] of RULES) {
      if (pattern.test(lines[i])) leads.push({ line: i + 1, id, message });
      if (leads.length >= limit) return leads;
    }
  }
  return leads;
}
