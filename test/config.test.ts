import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

const httpEnv = {
  MCP_TRANSPORT: 'http',
  GODOT_MCP_WORKSPACE: '/workspace',
  MCP_ALLOWED_HOSTS: 'godot-mcp.software.nuvello.com.br',
} as NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('defaults to stdio with no confinement', () => {
    const config = loadConfig({});
    expect(config.transport).toBe('stdio');
    expect(config.workspaceRoot).toBeUndefined();
  });

  // Godot debug writes temp files into the user's project and sleeps; it must
  // never be on unless asked for.
  it('keeps Godot debug off by default', () => {
    expect(loadConfig({}).godotDebug).toBe(false);
  });

  it('turns Godot debug on via either flag', () => {
    expect(loadConfig({ GODOT_DEBUG: 'true' }).godotDebug).toBe(true);
    expect(loadConfig({ DEBUG: 'true' }).godotDebug).toBe(true);
  });

  it('accepts a valid http configuration', () => {
    const config = loadConfig(httpEnv);
    expect(config.transport).toBe('http');
    expect(config.workspaceRoot).toBe('/workspace');
    expect(config.http.allowedHosts).toEqual(['godot-mcp.software.nuvello.com.br']);
  });

  // Over HTTP, an unconfined server would take arbitrary host paths from
  // anyone who can reach it.
  it('refuses http without a workspace root', () => {
    expect(() => loadConfig({ ...httpEnv, GODOT_MCP_WORKSPACE: undefined })).toThrow(
      /requires GODOT_MCP_WORKSPACE/,
    );
  });

  it('refuses http without allowed hosts', () => {
    expect(() => loadConfig({ ...httpEnv, MCP_ALLOWED_HOSTS: undefined })).toThrow(
      /requires MCP_ALLOWED_HOSTS/,
    );
  });

  it('parses a comma-separated host list', () => {
    const config = loadConfig({ ...httpEnv, MCP_ALLOWED_HOSTS: ' a.com , b.com ,, ' });
    expect(config.http.allowedHosts).toEqual(['a.com', 'b.com']);
  });

  it('falls back to defaults for unparseable numbers', () => {
    const config = loadConfig({ GODOT_MCP_TIMEOUT_MS: 'abc', MCP_HTTP_PORT: '-5' });
    expect(config.operationTimeoutMs).toBe(120_000);
    expect(config.http.port).toBe(8086);
  });
});
