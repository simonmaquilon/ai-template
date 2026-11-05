import assert from 'node:assert/strict';
import test from 'node:test';
import { securityLeads } from '../security-patterns.mjs';

const MIB = 2 ** 20;
const fill = (unit) => unit.repeat(Math.ceil(MIB / unit.length));
// Single 1 MiB lines that repeat the start of a rule without ever completing it, the input that makes a pattern
// with an open-ended gap rescan the rest of the line from every start.
const HOSTILE = [
  'query(`', 'execute("', 'execute(f"', 'exec(', 'exec("a', 'subprocess.run(', 'spawn(', 'setTimeout(', 'innerHTML ',
  'createHash(', 'createCipheriv("', 'aes-', 'Math.random() ', 'token random.choice(', '-----BEGIN ', 'AKIA', 'gh',
  'apiKey = "', 'secret: "a', 'verify', 'jwt.verify(', 'algorithms: [', '.run(', 'Access-Control-Allow-Origin ',
  'origin: ', 'cors(', 'secure: ', 'resolve_entities', 'yaml.load(', 'curl ', '| ', 'redirect(', 'readFile(',
  'path.join(', 'fetch(', 'fetch(`${', 'req.query.', ' ', 'a',
];

// And each start once, followed by 1 MiB of a filler that two adjacent open gaps could split in every way.
const PREFIXED = [...HOSTILE.map((unit) => [unit, ' ']), ['algorithms:', ' '], ['algorithms=', '\t'], ['verify', ' ']];

const timed = (label, text) => test(`security rules: ${label} finishes in under a second`, () => {
  const start = performance.now();
  securityLeads(text);
  assert.ok(performance.now() - start < 1000, `${label}: ${Math.round(performance.now() - start)} ms`);
});
for (const unit of HOSTILE) timed(`${JSON.stringify(unit)} repeated over 1 MiB`, fill(unit));
for (const [prefix, filler] of PREFIXED) timed(`${JSON.stringify(prefix)} before 1 MiB of ${JSON.stringify(filler)}`, prefix + fill(filler));
