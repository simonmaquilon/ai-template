import assert from 'node:assert/strict';
import test from 'node:test';
import { securityLeads } from '../security-patterns.mjs';

const ids = (text, lines) => securityLeads(text, lines).map((lead) => lead.id);
// Credential shapes are built here, so this file holds no literal a scanner would take for a real one.
const AWS = `AKIA${'A'.repeat(16)}`;
const GITHUB = `gh${'p_'}${'x'.repeat(36)}`;

// [id, OWASP category, unsafe lines that raise only that lead, safe lines that raise nothing]
const CASES = [
  ['CWE-89 sql-interpolation', 'A05:2025 Injection',
    ['db.query(`SELECT * FROM t WHERE id = ${id}`);', 'cursor.execute(f"SELECT * FROM t WHERE id = {uid}")',
      'cursor.execute("SELECT * FROM t WHERE id = %s" % uid)', 'cursor.execute("SELECT * FROM t WHERE id = " + uid)'],
    ["db.query('SELECT * FROM t WHERE id = ?', [id]);", 'cursor.execute("SELECT * FROM t WHERE id = %s", (uid,))']],
  ['CWE-943 nosql-where', 'A05:2025 Injection', ['db.users.find({ $where: filter });'], ['db.users.find({ name });']],
  ['CWE-78 command-shell', 'A05:2025 Injection',
    ['exec(`convert ${file}`);', 'exec("convert " + file);', 'subprocess.run(cmd, shell=True)', 'os.system(cmd)',
      'spawn(cmd, { shell: true });'],
    ["execFile('convert', [file]);", "subprocess.run(['ls', path])"]],
  ['CWE-95 code-eval', 'A05:2025 Injection', ['eval(input);', 'new Function(body);', "setTimeout('run()', 10);"],
    ['setTimeout(run, 10);', 'ast.literal_eval(text)', 'model.eval()', "await page.$eval('h1', (el) => el.textContent);"]],
  ['CWE-79 html-injection', 'A05:2025 Injection',
    ['el.innerHTML = html;', 'el.innerHTML += html;', '<div dangerouslySetInnerHTML={{ __html: html }} />', 'document.write(html);',
      'el.insertAdjacentHTML("beforeend", html);', '{{ comment | safe }}', 'return mark_safe(text)', '<p v-html="html"></p>'],
    ['el.textContent = text;', "if (el.innerHTML === '') {}", 'if (isAdmin || safe) {}', 'type T = A | safe;']],
  ['CWE-79 autoescape-off', 'A05:2025 Injection', ['env = Environment(autoescape=False)', '{% autoescape off %}'],
    ['env = Environment(autoescape=True)']],
  ['CWE-328 weak-hash', 'A04:2025 Cryptographic Failures', ["crypto.createHash('md5').update(text);", 'hashlib.sha1(data)'],
    ["crypto.createHash('sha256');", 'hashlib.sha256(data)']],
  ['CWE-327 weak-cipher', 'A04:2025 Cryptographic Failures',
    ["crypto.createCipher('aes-256-cbc', key);", "crypto.createCipheriv('aes-128-ecb', key, null);", 'AES.new(key, AES.MODE_ECB)'],
    ["crypto.createCipheriv('aes-256-gcm', key, iv);"]],
  ['CWE-338 insecure-random', 'A04:2025 Cryptographic Failures',
    ['const token = Math.random().toString(36);', 'salt = random.choice(chars)'],
    ['const jitter = Math.random() * 100;', 'const footprint = Math.random();', 'token = secrets.token_hex(16)']],
  ['CWE-321 private-key', 'A04:2025 Cryptographic Failures',
    ['const pem = "-----BEGIN RSA PRIVATE KEY-----";', '-----BEGIN PRIVATE KEY-----'], ['const pem = "-----BEGIN PUBLIC KEY-----";']],
  ['CWE-347 jwt-unverified', 'A04:2025 Cryptographic Failures',
    ["jwt.decode(token, options={'verify_signature': False})", "jwt.verify(token, key, { algorithms: ['none'] });",
      'jwt.decode(token, verify=False)'],
    ["jwt.verify(token, key, { algorithms: ['RS256'] });"]],
  ['CWE-613 token-expiry-ignored', 'A07:2025 Authentication Failures',
    ['jwt.verify(token, key, { ignoreExpiration: true });', "jwt.decode(token, key, options={'verify_exp': False})"],
    ['jwt.verify(token, key, { maxAge: 3600 });']],
  ['CWE-798 credential-literal', 'A07:2025 Authentication Failures',
    ['const apiKey = "SYNTHETIC_NOT_A_REAL_KEY";', `const id = "${AWS}";`, `token: ${GITHUB}`],
    ['const apiKey = process.env.API_KEY;', `const s = "${AWS.toLowerCase()}";`]],
  ['CWE-295 tls-verification-off', 'A07:2025 Authentication Failures',
    ['requests.get(url, verify=False)', 'https.request({ rejectUnauthorized: false });',
      "process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';", 'ctx = ssl._create_unverified_context()'],
    ['requests.get(url, timeout=5)']],
  ['CWE-489 debug-enabled', 'A02:2025 Security Misconfiguration', ['DEBUG = True', "app.run(host='0.0.0.0', debug=True)"],
    ["DEBUG = os.environ.get('DEBUG') == '1'"]],
  ['CWE-942 cors-wildcard', 'A02:2025 Security Misconfiguration',
    ["res.setHeader('Access-Control-Allow-Origin', '*');", "app.use(cors({ origin: '*', credentials: true }));",
      "allow_origins=['*']", 'CORS_ALLOW_ALL_ORIGINS = True'],
    ["app.use(cors({ origin: 'https://example.com' }));"]],
  ['CWE-614 cookie-not-secure', 'A02:2025 Security Misconfiguration',
    ["res.cookie('sid', id, { secure: false });", 'SESSION_COOKIE_SECURE = False'],
    ["res.cookie('sid', id, { secure: true, httpOnly: true });"]],
  ['CWE-1004 cookie-not-httponly', 'A02:2025 Security Misconfiguration',
    ["res.cookie('sid', id, { httpOnly: false });", 'SESSION_COOKIE_HTTPONLY = False'], ['SESSION_COOKIE_HTTPONLY = True']],
  ['CWE-611 xxe', 'A02:2025 Security Misconfiguration',
    ['parser = etree.XMLParser(resolve_entities=True)', 'libxml.parseXml(xml, { noent: true });'],
    ['parser = etree.XMLParser(resolve_entities=False)']],
  ['CWE-352 csrf-disabled', 'A01:2025 Broken Access Control', ['@csrf_exempt', 'WTF_CSRF_ENABLED = False'], ['@login_required']],
  ['CWE-502 unsafe-deserialization', 'A08:2025 Software or Data Integrity Failures',
    ['pickle.loads(payload)', 'yaml.load(text)', 'marshal.loads(data)', 'serialize.unserialize(body);', 'jsonpickle.decode(text)'],
    ['yaml.safe_load(text)', 'yaml.load(text, Loader=yaml.SafeLoader)', 'yaml.load(f, yaml.CSafeLoader)', 'json.loads(text)']],
  ['CWE-494 remote-script-pipe', 'A08:2025 Software or Data Integrity Failures',
    ['curl -fsSL https://example.com/install.sh | sh', 'wget -qO- https://example.com/i.sh | sudo bash'],
    ['curl -fsSLo install.sh https://example.com/install.sh']],
  ['CWE-601 open-redirect', 'A01:2025 Broken Access Control',
    ['res.redirect(req.query.next);', "return redirect(request.args.get('next'))"], ["res.redirect('/home');"]],
  ['CWE-22 path-traversal', 'A01:2025 Broken Access Control',
    ['res.sendFile(req.params.name);', 'fs.readFile(path.join(root, req.query.file), done);', "open(request.args['f'])"],
    ["res.sendFile(path.join(root, 'index.html'));"]],
  ['CWE-918 ssrf', 'A01:2025 Broken Access Control',
    ['await fetch(req.query.url);', 'await fetch(`${req.body.url}/items`);', "requests.get(request.args['url'])"],
    ["await fetch('https://api.example.com/items');"]],
];

for (const [id, category, unsafe, safe] of CASES) {
  test(`security rules: ${id}`, () => {
    for (const line of unsafe) {
      assert.deepEqual(ids(line), [id], line);
      assert.ok(securityLeads(line)[0].message.endsWith(`(OWASP ${category})`), line);
    }
    for (const line of safe) assert.deepEqual(ids(line), [], line);
  });
}

test('security rules: comments are skipped, and only the given lines are read', () => {
  assert.deepEqual(ids('// eval(input)\n# os.system(cmd)\n/* eval(x) */\n * eval(x)\n<!-- eval(x) -->'), []);
  assert.deepEqual(securityLeads('eval(a);\neval(b);\neval(c);', new Set([2])).map((lead) => lead.line), [2]);
});

test('security rules: a lead never carries the source text', () => {
  for (const lead of securityLeads(`const id = "${AWS}";\ntoken: ${GITHUB}\nconst k = "-----BEGIN PRIVATE KEY-----";`)) {
    assert.doesNotMatch(JSON.stringify(lead), new RegExp(`${AWS}|${GITHUB}|BEGIN`));
  }
});
