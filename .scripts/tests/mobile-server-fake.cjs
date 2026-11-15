// A stand-in for the appium-mcp server that mobile-server-fixture.mjs installs: it speaks just enough MCP to answer
// `initialize` and `tools/list`, echoes any other line of stdin as `echo:<line>`, and exits on `exit:<code>` or when
// stdin ends. It tells where it started on stderr (`ready <pid>`), and the environment picks the odd behaviors:
// FAKE_NOISE writes a line that is not JSON to stdout first, FAKE_SILENT never answers, FAKE_EXIT_AT_START exits at
// once with that code, FAKE_PAGED lists its tools on two pages, and FAKE_SPAWN starts a worker thread and forks a
// process from this file, which say `worker ok` and `fork ok` on stderr when they run as they would without a launcher.
const { fork } = require('node:child_process');
const { createInterface } = require('node:readline');
const { Worker, isMainThread, parentPort } = require('node:worker_threads');

if (!isMainThread) return parentPort.postMessage('worker ok');
if (process.argv[2] === 'forked') return process.on('message', () => process.send('fork ok', () => process.exit(0)));

if (process.env.FAKE_EXIT_AT_START) process.exit(Number(process.env.FAKE_EXIT_AT_START));
process.on('SIGTERM', () => {
  process.stderr.write('got SIGTERM\n');
  process.exit(7);
});
process.stderr.write(`ready ${process.pid}\n`);
if (process.env.FAKE_SPAWN) {
  const say = (text) => process.stderr.write(`${text}\n`);
  new Worker(__filename).on('message', say).on('error', (error) => say(`worker failed: ${error.message}`));
  const forked = fork(__filename, ['forked']).on('message', say).on('exit', (code) => code !== 0 && say(`fork failed: ${code}`));
  setTimeout(() => forked.send('ping'), 300);
}
if (process.env.FAKE_NOISE) process.stdout.write('this is not JSON\n');
const reply = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
const tools = (count) => Array.from({ length: count }, (_, i) => ({ name: `tool-${i}` }));
createInterface({ input: process.stdin }).on('line', (line) => {
  if (line.startsWith('exit:')) process.exit(Number(line.slice('exit:'.length)));
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    process.stdout.write(`echo:${line}\n`);
    return;
  }
  if (process.env.FAKE_SILENT) return;
  if (message.method === 'initialize') reply(message.id, { protocolVersion: message.params.protocolVersion, capabilities: {}, serverInfo: { name: 'Fake Appium', version: '9.8.7' } });
  else if (message.method === 'tools/list') {
    const paged = process.env.FAKE_PAGED;
    reply(message.id, paged && message.params.cursor === undefined ? { tools: tools(3), nextCursor: 'next' } : { tools: tools(paged ? 2 : 3) });
  }
}).on('close', () => process.exit(0));
