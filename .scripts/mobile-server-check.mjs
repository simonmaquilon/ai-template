// The MCP handshake behind `mobile-server.mjs --check`: over the stdio of a server that was just started it sends
// `initialize` and `notifications/initialized`, then lists the tools, and resolves with one line naming the server, its
// version and how many tools it lists. It rejects when the server answers with an error, writes to stdout anything but
// JSON, exits, or does not finish in time, which also tells a client that the server speaks only the protocol on stdout.

const PROTOCOL_VERSION = '2025-06-18';

// `child` was spawned with stdin and stdout piped; `timeout` is in milliseconds.
export function checkServer(child, timeout) {
  return new Promise((resolve, reject) => {
    let info;
    let tools = 0;
    let id = 1;
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`the server did not finish the handshake within ${timeout} ms`)), timeout);
    const send = (message) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
    const listTools = (cursor) => send({ id: ++id, method: 'tools/list', params: cursor === undefined ? {} : { cursor } });
    const done = (line) => {
      clearTimeout(timer);
      resolve(line);
    };

    function answer(line) {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return reject(new Error(`the server wrote to stdout something that is not JSON: ${line.slice(0, 80)}`));
      }
      if (message.id === undefined || message.method !== undefined) return undefined; // notifications and requests of the server
      if (message.error) return reject(new Error(`the server answered request ${message.id} with an error: ${message.error.message ?? 'no message'}`));
      if (message.id === 1) {
        info = message.result?.serverInfo;
        if (typeof info?.name !== 'string') return reject(new Error('the server did not name itself in its initialize result'));
        send({ method: 'notifications/initialized' });
        return listTools();
      }
      if (!Array.isArray(message.result?.tools)) return reject(new Error('the server did not answer tools/list with a list of tools'));
      tools += message.result.tools.length;
      return message.result.nextCursor === undefined ? done(`${info.name} ${info.version ?? 'unknown'}: ${tools} tools`) : listTools(message.result.nextCursor);
    }

    child.on('error', reject);
    child.on('close', (code, signal) => reject(new Error(`the server exited (${code ?? signal}) before the handshake ended`)));
    child.stdin.on('error', () => {}); // the close event of the child says why
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      for (let end = buffer.indexOf('\n'); end !== -1; end = buffer.indexOf('\n')) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (line !== '') answer(line);
      }
    });
    send({ id, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'mobile-server-check', version: '1' } } });
  });
}
