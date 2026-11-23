import { resolve } from 'node:path';

export type TransportKind = 'stdio' | 'http';

export interface HttpConfig {
  host: string;
  port: number;
  /** MCP endpoint path, e.g. "/mcp" */
  endpoint: string;
  /**
   * Hosts accepted in the Host header. Required to block DNS rebinding, where
   * a page on an attacker's domain resolves to this server and speaks to it
   * from the victim's browser.
   */
  allowedHosts: string[];
  allowedOrigins: string[];
}

export interface ServerConfig {
  /** Explicit Godot executable; auto-detected when absent. */
  godotPath?: string;
  /** Verbose server logging. */
  debug: boolean;
  /**
   * Verbose logging inside the bundled GDScript. Off by default: its debug
   * paths write temp files into the user's project and add artificial delays.
   */
  godotDebug: boolean;
  /** Refuse to start rather than falling back to a guessed Godot path. */
  strictPathValidation: boolean;
  /**
   * Confines every project path to this directory. Unset means no confinement,
   * which is only appropriate for stdio, where the client already runs as the
   * user. Required for the HTTP transport.
   */
  workspaceRoot?: string;
  transport: TransportKind;
  http: HttpConfig;
  /** A hung Godot would otherwise block the server forever. */
  operationTimeoutMs: number;
  /** The 1MB default truncates verbose operations into spurious failures. */
  operationMaxBuffer: number;
  /** Depth limit for directory scans. */
  maxScanDepth: number;
  /** Cap on retained stdout/stderr lines per run, so a chatty project cannot grow without bound. */
  maxOutputLines: number;
}

const DEFAULTS = {
  operationTimeoutMs: 120_000,
  operationMaxBuffer: 32 * 1024 * 1024,
  maxScanDepth: 8,
  maxOutputLines: 5_000,
  httpPort: 8080,
  httpHost: '0.0.0.0',
  httpEndpoint: '/mcp',
} as const;

function flag(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

function integer(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function list(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const transport: TransportKind = env.MCP_TRANSPORT === 'http' ? 'http' : 'stdio';
  const workspaceRoot = env.GODOT_MCP_WORKSPACE
    ? resolve(env.GODOT_MCP_WORKSPACE)
    : undefined;

  const config: ServerConfig = {
    godotPath: env.GODOT_PATH,
    debug: flag(env.DEBUG),
    godotDebug: flag(env.GODOT_DEBUG) || flag(env.DEBUG),
    strictPathValidation: flag(env.GODOT_MCP_STRICT_PATHS),
    workspaceRoot,
    transport,
    http: {
      host: env.MCP_HTTP_HOST ?? DEFAULTS.httpHost,
      port: integer(env.MCP_HTTP_PORT, DEFAULTS.httpPort),
      endpoint: env.MCP_HTTP_ENDPOINT ?? DEFAULTS.httpEndpoint,
      allowedHosts: list(env.MCP_ALLOWED_HOSTS),
      allowedOrigins: list(env.MCP_ALLOWED_ORIGINS),
    },
    operationTimeoutMs: integer(env.GODOT_MCP_TIMEOUT_MS, DEFAULTS.operationTimeoutMs),
    operationMaxBuffer: integer(env.GODOT_MCP_MAX_BUFFER, DEFAULTS.operationMaxBuffer),
    maxScanDepth: integer(env.GODOT_MCP_MAX_SCAN_DEPTH, DEFAULTS.maxScanDepth),
    maxOutputLines: integer(env.GODOT_MCP_MAX_OUTPUT_LINES, DEFAULTS.maxOutputLines),
  };

  validate(config);
  return config;
}

/**
 * Reject configurations that would be unsafe rather than merely wrong, so the
 * failure happens at startup instead of on the first tool call.
 */
function validate(config: ServerConfig): void {
  if (config.transport !== 'http') return;

  if (!config.workspaceRoot) {
    throw new Error(
      'MCP_TRANSPORT=http requires GODOT_MCP_WORKSPACE. Without it, every tool ' +
      'would accept arbitrary paths on the host filesystem from any client that ' +
      'can reach this server.',
    );
  }

  if (config.http.allowedHosts.length === 0) {
    throw new Error(
      'MCP_TRANSPORT=http requires MCP_ALLOWED_HOSTS (comma-separated), e.g. ' +
      '"godot-mcp.software.nuvello.com.br". It is what blocks DNS rebinding.',
    );
  }
}
