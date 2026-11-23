import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import type { ServerConfig } from '../config.js';
import { buildServer, type BuiltServer } from '../server.js';
import type { Logger } from '../lib/log.js';
import { installArgumentAliases } from './aliases.js';

/** Refuse bodies large enough to be a denial of service rather than a request. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * Cap on concurrent sessions. Each one can hold a running Godot process, so
 * this is a real resource bound, not just bookkeeping.
 */
const MAX_SESSIONS = 32;

export interface HttpHandle {
  close(): Promise<void>;
  port: number;
  sessionCount(): number;
}

interface Session {
  transport: StreamableHTTPServerTransport;
  built: BuiltServer;
}

/**
 * Serve MCP over Streamable HTTP, one server instance per client session.
 *
 * Per-session is not an optimization detail: the tool surface is stateful
 * (run_project / get_debug_output / stop_project all address "the" running
 * project), so a shared instance would let one client stop another client's
 * game and read its output. A single shared transport also cannot work at all,
 * since the second client's `initialize` is rejected as a double init.
 */
export async function serveHttp(
  built: BuiltServer,
  config: ServerConfig,
): Promise<HttpHandle> {
  const { host, port, endpoint } = config.http;
  const logger = built.logger;
  const sessions = new Map<string, Session>();

  // The server instance passed in owns no session; it is used for the startup
  // Godot probe and is disposed by the caller.
  const http = createServer((req, res) => {
    void route(req, res, { config, logger, endpoint, sessions }).catch((error) => {
      logger.error(`Unhandled HTTP failure: ${describe(error)}`);
      if (!res.headersSent) respondJson(res, 500, { error: 'Internal error' });
    });
  });

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(port, host, () => {
      http.removeListener('error', reject);
      resolve();
    });
  });

  logger.info(`Godot MCP server listening on http://${host}:${port}${endpoint}`);
  logger.info(`Accepted Host headers: ${config.http.allowedHosts.join(', ')}`);
  logger.info(`Workspace root: ${config.workspaceRoot}`);

  return {
    port,
    sessionCount: () => sessions.size,
    close: async () => {
      await Promise.all(
        [...sessions.values()].map((session) => session.built.dispose().catch(() => {})),
      );
      sessions.clear();

      await new Promise<void>((resolve, reject) => {
        http.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

interface RouteDeps {
  config: ServerConfig;
  logger: Logger;
  endpoint: string;
  sessions: Map<string, Session>;
}

async function route(req: IncomingMessage, res: ServerResponse, deps: RouteDeps): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');

  // Liveness probe for the container runtime and the reverse proxy. Outside
  // the MCP endpoint so it needs no session and no MCP headers.
  if (url.pathname === '/healthz') {
    respondJson(res, 200, { status: 'ok', sessions: deps.sessions.size });
    return;
  }

  if (url.pathname !== deps.endpoint) {
    respondJson(res, 404, { error: `No handler for ${url.pathname}` });
    return;
  }

  let body: unknown;
  try {
    body = await readBody(req);
  } catch (error) {
    respondJson(res, 400, { error: describe(error) });
    return;
  }

  const sessionId = headerValue(req, 'mcp-session-id');

  if (sessionId) {
    const session = deps.sessions.get(sessionId);
    if (!session) {
      respondJson(res, 404, { error: 'Unknown or expired session' });
      return;
    }
    await session.transport.handleRequest(req, res, body);
    return;
  }

  if (!isInitializeRequest(body)) {
    respondJson(res, 400, {
      error: 'Expected an initialize request, or an Mcp-Session-Id header',
    });
    return;
  }

  if (deps.sessions.size >= MAX_SESSIONS) {
    deps.logger.warn(`Refusing new session: ${MAX_SESSIONS} already active`);
    respondJson(res, 503, { error: 'Too many active sessions' });
    return;
  }

  await openSession(req, res, body, deps);
}

/** Build a fresh server for a new client and let it handle its own initialize. */
async function openSession(
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  deps: RouteDeps,
): Promise<void> {
  const { config, logger, sessions } = deps;

  const built = buildServer(config, logger);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    // Without this, a page on any origin could drive this server through a
    // victim's browser by pointing a hostname at it.
    enableDnsRebindingProtection: true,
    allowedHosts: config.http.allowedHosts,
    allowedOrigins: config.http.allowedOrigins.length > 0 ? config.http.allowedOrigins : undefined,
    // Registered here rather than assigned after: the transport reads this
    // during the initialize it is about to handle.
    onsessioninitialized: (id) => {
      sessions.set(id, { transport, built });
      logger.info(`Session opened: ${id} (${sessions.size} active)`);
    },
  });

  transport.onclose = () => {
    const id = transport.sessionId;
    if (id && sessions.delete(id)) {
      logger.info(`Session closed: ${id} (${sessions.size} active)`);
    }
    // Tear down the Godot process this session was running
    void built.dispose().catch((error) => {
      logger.error(`Failed to dispose session ${id}: ${describe(error)}`);
    });
  };

  await built.server.connect(transport);
  installArgumentAliases(transport);

  await transport.handleRequest(req, res, body);
}

/**
 * Read and parse a JSON body, if there is one.
 *
 * GET (the SSE stream) and DELETE (session teardown) carry no body, and the
 * transport expects undefined rather than an empty object for those.
 */
async function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'DELETE' || req.method === 'HEAD') {
    return undefined;
  }

  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes`);
    }
    chunks.push(buffer);
  }

  if (total === 0) return undefined;

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Request body is not valid JSON');
  }
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

function respondJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
