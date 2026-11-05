// Heuristic leads for the edit hook, not vulnerability verdicts. Never return
// source text or captured values; contextual validation belongs to the agent.
// Each rule names its CWE and the OWASP Top 10:2025 category whose mapped CWEs,
// at top10.owasp.org/2025, list it; CWE-943 (NoSQL injection), which no list
// names, goes under A05 Injection, whose description covers it. Every gap after a
// rule's start is bounded or stops at a character that start holds, and no two
// open gaps touch, so a line costs linear time.

const OWASP = {
  A01: 'A01:2025 Broken Access Control',
  A02: 'A02:2025 Security Misconfiguration',
  A04: 'A04:2025 Cryptographic Failures',
  A05: 'A05:2025 Injection',
  A07: 'A07:2025 Authentication Failures',
  A08: 'A08:2025 Software or Data Integrity Failures',
};
// Request input that reaches a sink directly or as the start of a template literal.
const USER = String.raw`(?:\`\$\{\s*)?(?:req|request)\.(?:query|params|body|args|form|files|GET|POST)\b`;
const SECRET_NAME = /token|secret|passw|nonce|salt|\botp\b|session|api[_-]?key/i;

// [id, CWE, OWASP key, pattern, message, a second pattern the line must also match]
const RULES = [
  ['sql-interpolation', 89, 'A05', new RegExp(String.raw`\b(?:query|execute|executemany|prepare|raw)\s*\(\s*(?:\`[^\`]*\$\{|f["']|(?:"[^"]*"|'[^']*')\s*(?:%|\+|\.format\())`),
    'Check query parameterization and input ownership.'],
  ['nosql-where', 943, 'A05', /["']?\$where["']?\s*:/, 'Check whether untrusted input reaches a $where query.'],
  ['command-shell', 78, 'A05',
    /\bexec(?:Sync)?\s*\(\s*(?:`[^`]*\$\{|"[^"]*"\s*\+|'[^']*'\s*\+|(?:req|request|input|payload|params|body)\b)|\bshell\s*(?::\s*true|=\s*True)\b|\bos\.(?:system|popen)\s*\(/,
    'Check shell input and argument-safe process APIs.'],
  ['code-eval', 95, 'A05', /(?<!\$)\beval\s*\((?!\s*\))|\bnew\s+Function\s*\(|\bset(?:Timeout|Interval)\s*\(\s*["'`]/,
    'Check whether untrusted input reaches dynamic evaluation.'],
  ['html-injection', 79, 'A05',
    /\b(?:innerHTML|outerHTML)\s*\+?=(?!=)|\bv-html\s*=|\bdangerouslySetInnerHTML\b|\bdocument\.write(?:ln)?\s*\(|\binsertAdjacentHTML\s*\(|\{\{[^}]{0,200}\|\s*safe\b|\bmark_safe\s*\(|\bMarkup\s*\(/,
    'Check untrusted HTML and contextual sanitization.'],
  ['autoescape-off', 79, 'A05', /\bautoescape\s*=\s*False\b|\{%\s*autoescape\s+(?:off|false)\b/,
    'Check where template autoescaping is turned off.'],
  ['weak-hash', 328, 'A04', /\bcreateHash\s*\(\s*["'](?:md5|sha1)["']|\bhashlib\.(?:md5|sha1)\s*\(|\bhashlib\.new\s*\(\s*["'](?:md5|sha1)["']/i,
    'Check whether a broken hash protects passwords, tokens, or integrity.'],
  ['weak-cipher', 327, 'A04', /\bcreateCipher\s*\(|\bcreateCipheriv\s*\(\s*["'](?:des|rc4|bf|[\w-]{0,40}-ecb)\b|\bMODE_ECB\b|\b(?:DES|DES3|ARC4|Blowfish)\.new\s*\(/i,
    'Check the cipher, mode, and IV for a modern authenticated algorithm.'],
  ['insecure-random', 338, 'A04', /\bMath\.random\s*\(|\brandom\.(?:random|randint|choice|choices|randrange|getrandbits)\s*\(/,
    'Check that secret values come from a cryptographic random source.', SECRET_NAME],
  ['private-key', 321, 'A04', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/, 'Check a possible private key without displaying it.'],
  ['jwt-unverified', 347, 'A04',
    /\balgorithms?["']?\s*[:=]\s*(?:\[\s*)?["']none["']|["']?verify_signature["']?\s*:\s*False\b|\bjwt\.decode\s*\([^)]{0,200}\bverify\s*=\s*False\b/i,
    'Check that token signatures and algorithms are verified.'],
  ['token-expiry-ignored', 613, 'A07', /\bignoreExpiration\s*:\s*true\b|["']?verify_exp["']?\s*:\s*False\b/,
    'Check that expired tokens and sessions are refused.'],
  ['credential-literal', 798, 'A07',
    /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|secret)\s*[:=]\s*(['"])[^'"\r\n]{8,}\1/i,
    'Check a possible credential literal without displaying its value.'],
  ['credential-literal', 798, 'A07', /\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}/,
    'Check a possible credential literal without displaying its value.'],
  ['tls-verification-off', 295, 'A07',
    /\brejectUnauthorized\s*:\s*false\b|\bNODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|(?<!\bjwt\.decode\s{0,20}\([^)]{0,200})\bverify\s*=\s*False\b|\bcheck_hostname\s*=\s*False\b|\b_create_unverified_context\b|\bCERT_NONE\b/,
    'Check disabled transport certificate verification.'],
  ['debug-enabled', 489, 'A02', /^\s*DEBUG\s*=\s*True\b|\.run\s*\([^)]{0,200}\bdebug\s*=\s*True\b/,
    'Check that debug mode cannot reach a deployed environment.'],
  ['cors-wildcard', 942, 'A02',
    /Access-Control-Allow-Origin["']?\s*[,:]\s*["']\*["']|\borigin\s*:\s*["']\*["']|\b(?:allow_origins|CORS_ORIGINS)\s*=\s*\[\s*["']\*["']|\bCORS_ALLOW_ALL_ORIGINS\s*=\s*True\b/i,
    'Check the allowed origins, above all with credentials.'],
  ['cookie-not-secure', 614, 'A02', /\bsecure\s*:\s*false\b|\b(?:SESSION|CSRF)_COOKIE_SECURE\s*=\s*False\b/,
    'Check that session cookies require HTTPS.'],
  ['cookie-not-httponly', 1004, 'A02', /\bhttpOnly\s*:\s*false\b|\b(?:SESSION|CSRF)_COOKIE_HTTPONLY\s*=\s*False\b/i,
    'Check that session cookies stay hidden from scripts.'],
  ['xxe', 611, 'A02', /\bresolve_entities\s*=\s*True\b|\bnoent\s*:\s*true\b|\bno_network\s*=\s*False\b/,
    'Check that the XML parser cannot resolve external entities.'],
  ['csrf-disabled', 352, 'A01', /@csrf[_]exempt\b|\bWTF_CSRF_ENABLED\s*=\s*False\b|\bcsrf\s*:\s*false\b/,
    'Check why CSRF protection is off here.'],
  ['unsafe-deserialization', 502, 'A08',
    /\b(?:c?pickle|dill|marshal)\.loads?\s*\(|\byaml\.load\s*\((?![^)]{0,200}\bC?SafeLoader\b)|\byaml\.unsafe_load\s*\(|\bunserialize\s*\(|\bjsonpickle\.decode\s*\(/,
    'Check the input trust level and safe parser options.'],
  ['remote-script-pipe', 494, 'A08', /\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/,
    'Check that downloaded code is pinned and verified before it runs.', /\b(?:curl|wget)\b/],
  ['open-redirect', 601, 'A01', new RegExp(String.raw`\bredirect\s*\(\s*(?:\d{3}\s*,\s*)?${USER}`),
    'Check redirect targets against an allowlist.'],
  ['path-traversal', 22, 'A01',
    new RegExp(String.raw`\b(?:readFile|readFileSync|createReadStream|sendFile|send_file|unlink|unlinkSync|open)\s*\(\s*${USER}|\bpath\.(?:join|resolve)\s*\([^)]{0,200}${USER}`),
    'Check that request input cannot leave the intended directory.'],
  ['ssrf', 918, 'A01',
    new RegExp(String.raw`\b(?:fetch|axios(?:\.(?:get|post|put|delete|request))?|got|urlopen|requests\.(?:get|post|put|delete|head|request)|httpx\.(?:get|post)|https?\.get)\s*\(\s*${USER}`),
    'Check that request input cannot choose the server-side request target.'],
];

// Leads for the given text, limited to the line numbers in `lines` when it is a set.
export function securityLeads(text, lines = null, limit = 20) {
  const leads = [];
  const all = text.split(/\r?\n/);
  for (let i = 0; i < all.length; i++) {
    if ((lines && !lines.has(i + 1)) || /^\s*(?:\/\/|#|\/\*|\*|<!--)/.test(all[i])) continue;
    for (const [id, cwe, key, pattern, message, context] of RULES) {
      if (!pattern.test(all[i]) || (context && !context.test(all[i]))) continue;
      const tag = `CWE-${cwe} ${id}`;
      // A rule split into several entries reports a line once.
      if (leads.some((lead) => lead.line === i + 1 && lead.id === tag)) continue;
      leads.push({ line: i + 1, id: tag, message: `${message} (OWASP ${OWASP[key]})` });
      if (leads.length >= limit) return leads;
    }
  }
  return leads;
}
