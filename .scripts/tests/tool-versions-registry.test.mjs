import assert from 'node:assert/strict';
import test from 'node:test';
import { attestations } from '../tool-versions-registry.mjs';

const URL = 'https://registry.npmjs.org/-/npm/v1/attestations/tool@1.0.0';

// Runs `work` with fetch and the proxy variables replaced, then puts them back.
async function withEnvironment(fetchStub, env, work) {
  const saved = { fetch: globalThis.fetch, env: { ...process.env } };
  globalThis.fetch = fetchStub;
  for (const key of Object.keys(process.env)) if (/proxy/i.test(key)) delete process.env[key];
  Object.assign(process.env, env);
  try {
    return await work();
  } finally {
    globalThis.fetch = saved.fetch;
    for (const key of Object.keys(process.env)) if (!(key in saved.env)) delete process.env[key];
    Object.assign(process.env, saved.env);
  }
}

test('attestations reads only the registry attestations endpoint', async () => {
  const calls = [];
  const stub = async (url) => { calls.push(url); return { ok: true, json: async () => ({ attestations: [] }) }; };
  assert.deepEqual(await withEnvironment(stub, {}, () => attestations(URL)), { attestations: [] });
  await withEnvironment(stub, {}, async () => {
    for (const other of ['https://example.com/-/npm/v1/attestations/x', 'https://registry.npmjs.org.evil.test/-/npm/v1/attestations/x', 'https://registry.npmjs.org/tool']) {
      await assert.rejects(attestations(other), /is not the registry's/);
    }
  });
  assert.deepEqual(calls, [URL]);
});

test('attestations says why it cannot read the endpoint, and mentions an unused proxy', async () => {
  const unreachable = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
  await withEnvironment(unreachable, {}, () => assert.rejects(attestations(URL), (error) => /\(ENOTFOUND\)$/.test(error.message)));
  await withEnvironment(unreachable, { HTTPS_PROXY: 'http://127.0.0.1:9' }, () =>
    assert.rejects(attestations(URL), /\(ENOTFOUND\); this Node does not use the proxy variables of the environment/));
  await withEnvironment(unreachable, { HTTPS_PROXY: 'http://127.0.0.1:9', NODE_USE_ENV_PROXY: '1' }, () =>
    assert.rejects(attestations(URL), (error) => /\(ENOTFOUND\)$/.test(error.message)));
  await withEnvironment(async () => ({ ok: false, status: 404 }), {}, () => assert.rejects(attestations(URL), /the registry answered 404/));
});
