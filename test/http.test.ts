import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { request } from 'node:http';

import { loadConfig } from '../src/config.js';
import { buildServer, type BuiltServer } from '../src/server.js';
import { serveHttp, type HttpHandle } from '../src/transport/http.js';
import { silentLogger } from '../src/lib/log.js';

/**
 * Send a request with a chosen Host header.
 *
 * fetch() silently drops `host` — it is a forbidden header — so any test that
 * means to exercise Host validation has to go through node:http. A fetch-based
 * version of these assertions passes without ever spoofing anything.
 */
function rawRequest(
  port: string,
  path: string,
  host: string,
  body?: unknown,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);

    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: payload ? 'POST' : 'GET',
        headers: {
          Host: host,
          Accept: 'application/json, text/event-stream',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk) => { text += chunk; });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'probe', version: '0' },
  },
};

/**
 * Exercises the transport the deployment actually uses. Everything here runs
 * over a real socket, so a mistake in routing, body handling or the host
 * guard fails the suite rather than the production host.
 */
describe('streamable http transport', () => {
  const PORT = '34517';
  let built: BuiltServer;
  let handle: HttpHandle;

  beforeAll(async () => {
    const config = loadConfig({
      MCP_TRANSPORT: 'http',
      MCP_HTTP_HOST: '127.0.0.1',
      MCP_HTTP_PORT: PORT,
      GODOT_MCP_WORKSPACE: process.cwd(),
      MCP_ALLOWED_HOSTS: `127.0.0.1:${PORT}`,
    });

    built = buildServer(config, silentLogger);
    handle = await serveHttp(built, config);
  });

  afterAll(async () => {
    await handle?.close();
    await built?.dispose();
  });

  const base = `http://127.0.0.1:${PORT}`;

  it('answers the health probe the container healthcheck uses', async () => {
    const response = await fetch(`${base}/healthz`);
    expect(response.ok).toBe(true);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });

  it('404s an unknown path', async () => {
    const response = await fetch(`${base}/nope`);
    expect(response.status).toBe(404);
  });

  it('completes an MCP handshake and lists tools', async () => {
    const client = new Client({ name: 'http-test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);

    expect(names).toContain('create_scene');

    // Over HTTP the display-dependent tools are deliberately not registered,
    // so a client never sees a tool it cannot possibly use here.
    for (const gated of ['launch_editor', 'run_project', 'get_debug_output', 'stop_project']) {
      expect(names, `${gated} should not be exposed over http`).not.toContain(gated);
    }
    expect(tools.length).toBe(10);

    await client.close();
  });

  it('calls a tool over http', async () => {
    const client = new Client({ name: 'http-test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));

    const result = await client.callTool({
      name: 'get_project_info',
      arguments: { projectPath: 'definitely-not-a-project' },
    });

    // Reaching the project check proves routing, body parsing and dispatch
    expect(JSON.stringify(result.content)).toContain('Not a Godot project');
    await client.close();
  });

  // Workspace confinement is the whole reason this is safe to expose.
  it('refuses a project path outside the workspace', async () => {
    const client = new Client({ name: 'http-test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));

    const result = await client.callTool({
      name: 'get_project_info',
      arguments: { projectPath: '/etc' },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('outside the configured workspace');
    await client.close();
  });

  // DNS rebinding guard: a page on another origin resolving a name to this
  // host must not be able to drive it.
  //
  // Goes through node:http deliberately. The fetch-based version of this test
  // passed while proving nothing, because fetch dropped the spoofed Host and
  // the request then failed for want of a session instead.
  it('rejects a request with an unexpected Host header', async () => {
    const response = await rawRequest(PORT, '/mcp', 'evil.example.com', INITIALIZE);

    expect(response.status).toBe(403);
    expect(response.text).toContain('Invalid Host header');
  });

  it('accepts the configured Host', async () => {
    const response = await rawRequest(PORT, '/mcp', `127.0.0.1:${PORT}`, INITIALIZE);

    expect(response.status).toBe(200);
  });

  it('rejects a malformed body without crashing the server', async () => {
    const bad = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json at all',
    });
    expect(bad.ok).toBe(false);

    // Still serving afterwards
    expect((await fetch(`${base}/healthz`)).ok).toBe(true);
  });
});

describe('session isolation', () => {
  const PORT = '34518';
  let built: BuiltServer;
  let handle: HttpHandle;

  beforeAll(async () => {
    const config = loadConfig({
      MCP_TRANSPORT: 'http',
      MCP_HTTP_HOST: '127.0.0.1',
      MCP_HTTP_PORT: PORT,
      GODOT_MCP_WORKSPACE: process.cwd(),
      MCP_ALLOWED_HOSTS: `127.0.0.1:${PORT}`,
    });
    built = buildServer(config, silentLogger);
    handle = await serveHttp(built, config);
  });

  afterAll(async () => {
    await handle?.close();
    await built?.dispose();
  });

  const connect = async () => {
    const client = new Client({ name: 'iso', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/mcp`)));
    return client;
  };

  // A single shared transport rejected the second client's initialize with
  // "Server already initialized", and a single shared server instance would
  // have let one client's stop_project kill another client's game.
  it('serves two clients at once, each with its own session', async () => {
    const [first, second] = await Promise.all([connect(), connect()]);

    expect(handle.sessionCount()).toBe(2);
    await expect(first.listTools()).resolves.toMatchObject({ tools: expect.anything() });
    await expect(second.listTools()).resolves.toMatchObject({ tools: expect.anything() });

    await Promise.all([first.close(), second.close()]);
  });

  it('keeps each session’s project state separate', async () => {
    const [first, second] = await Promise.all([connect(), connect()]);

    // Neither client has a running project; each must be told so independently
    const a = await first.callTool({ name: 'get_debug_output', arguments: {} });
    const b = await second.callTool({ name: 'get_debug_output', arguments: {} });

    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);

    await Promise.all([first.close(), second.close()]);
  });

  it('rejects a request carrying an unknown session id', async () => {
    const response = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-session-id': 'made-up-session',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });

    expect(response.status).toBe(404);
  });
});

describe('documentation route', () => {
  const PORT = '34519';
  const DOMAIN = 'godot-mcp.software.nuvello.com.br';
  let built: BuiltServer;
  let handle: HttpHandle;

  beforeAll(async () => {
    const config = loadConfig({
      MCP_TRANSPORT: 'http',
      MCP_HTTP_HOST: '127.0.0.1',
      MCP_HTTP_PORT: PORT,
      GODOT_MCP_WORKSPACE: process.cwd(),
      MCP_ALLOWED_HOSTS: `127.0.0.1:${PORT},${DOMAIN}`,
    });
    built = buildServer(config, silentLogger);
    handle = await serveHttp(built, config);
  });

  afterAll(async () => {
    await handle?.close();
    await built?.dispose();
  });

  const base = `http://127.0.0.1:${PORT}`;

  it('serves HTML at the root instead of a 404', async () => {
    const response = await fetch(`${base}/`);

    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('Godot MCP server');
  });

  it('documents every route the server answers', async () => {
    const html = await fetch(`${base}/`).then((r) => r.text());

    for (const path of ['/healthz', '/mcp']) {
      expect(html, `missing ${path}`).toContain(path);
    }
    expect(html).toContain('Mcp-Session-Id');
  });

  // The page is rendered from a real tools/list, so it cannot drift from the
  // tools the server actually exposes.
  it('lists exactly the tools this configuration exposes', async () => {
    const html = await fetch(`${base}/`).then((r) => r.text());

    for (const tool of ['create_scene', 'add_node', 'load_sprite', 'export_mesh_library', 'get_uid']) {
      expect(html, `missing ${tool}`).toContain(tool);
    }
  });

  // Over HTTP the display-dependent tools are gated off, and the page has to
  // say so rather than leaving a reader wondering where they went.
  it('explains why the process tools are absent over http', async () => {
    const html = await fetch(`${base}/`).then((r) => r.text());

    expect(html).toContain('Not available over HTTP');
    expect(html).toContain('GODOT_MCP_PROCESS_TOOLS');
  });

  it('shows a parameter table with required parameters marked', async () => {
    const html = await fetch(`${base}/`).then((r) => r.text());

    expect(html).toContain('projectPath');
    expect(html).toContain('class="req"');
  });

  // Behind a proxy, the examples must name the public domain, not the bind address
  it('uses the forwarded host and scheme in the connection examples', async () => {
    const html = await fetch(`${base}/`, {
      headers: { 'x-forwarded-host': DOMAIN, 'x-forwarded-proto': 'https' },
    }).then((r) => r.text());

    expect(html).toContain(`https://${DOMAIN}/mcp`);
  });

  // An attacker-supplied Host must not end up echoed into the page
  it('ignores a host that is not in the allowlist', async () => {
    const html = await fetch(`${base}/`, {
      headers: { 'x-forwarded-host': 'evil.example.com' },
    }).then((r) => r.text());

    expect(html).not.toContain('evil.example.com');
  });

  it('answers HEAD without a body', async () => {
    const response = await fetch(`${base}/`, { method: 'HEAD' });

    expect(response.ok).toBe(true);
    expect(await response.text()).toBe('');
  });
});

// Regression for issue #1: deployed behind a reverse proxy whose allowlist
// entry carried the container's internal port, every external client got
// 403 "Invalid Host header", and the landing page advertised a closed port.
describe('behind a reverse proxy whose allowlist carries the internal port', () => {
  const PORT = '34520';
  const DOMAIN = 'godot-mcp.software.nuvello.com.br';
  let built: BuiltServer;
  let handle: HttpHandle;

  beforeAll(async () => {
    const config = loadConfig({
      MCP_TRANSPORT: 'http',
      MCP_HTTP_HOST: '127.0.0.1',
      MCP_HTTP_PORT: PORT,
      GODOT_MCP_WORKSPACE: process.cwd(),
      // Exactly what Coolify's SERVICE_FQDN_GODOT_MCP_<port> produced
      MCP_ALLOWED_HOSTS: `${DOMAIN}:${PORT}`,
    });
    built = buildServer(config, silentLogger);
    handle = await serveHttp(built, config);
  });

  afterAll(async () => {
    await handle?.close();
    await built?.dispose();
  });

  const initialize = (host: string) => rawRequest(PORT, '/mcp', host, INITIALIZE);

  it('accepts the bare hostname the proxy actually forwards', async () => {
    const response = await initialize(DOMAIN);

    expect(response.status).toBe(200);
  });

  it('still accepts the port-suffixed form', async () => {
    expect((await initialize(`${DOMAIN}:${PORT}`)).status).toBe(200);
  });

  it('still rejects a hostname that was never configured', async () => {
    const response = await initialize('evil.example.com');

    expect(response.status).toBe(403);
    expect(response.text).toContain('Invalid Host header');
  });

  it('documents the public hostname without the internal port', async () => {
    const html = await fetch(`http://127.0.0.1:${PORT}/`, {
      headers: { 'x-forwarded-host': DOMAIN, 'x-forwarded-proto': 'https' },
    }).then((r) => r.text());

    expect(html).toContain(`https://${DOMAIN}/mcp`);
    expect(html).not.toContain(`${DOMAIN}:${PORT}`);
  });

  // Even with no Host to go on, the page must not publish the internal port
  it('omits the internal port from the fallback host too', async () => {
    const html = await fetch(`http://127.0.0.1:${PORT}/`).then((r) => r.text());

    expect(html).not.toContain(`${DOMAIN}:${PORT}`);
    expect(html).toContain(DOMAIN);
  });

  // Point 3 of the issue: a reader must not have to guess whose disk it is
  it('states that paths act on the server filesystem, not the caller\'s', async () => {
    const html = await fetch(`http://127.0.0.1:${PORT}/`).then((r) => r.text());

    expect(html).toContain("This server's own disk, not yours");
    expect(html).toContain('no file transport');
  });
});
