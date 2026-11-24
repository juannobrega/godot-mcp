import { describe, expect, it } from 'vitest';

import { displayHost, expandAllowedHosts, expandAllowedOrigins, splitHostPort } from '../src/lib/hosts.js';
import { loadConfig } from '../src/config.js';

describe('splitHostPort', () => {
  it.each([
    ['example.com', 'example.com', undefined],
    ['example.com:8086', 'example.com', '8086'],
    ['127.0.0.1:443', '127.0.0.1', '443'],
    ['[::1]', '[::1]', undefined],
    ['[::1]:8086', '[::1]', '8086'],
    // Not a port, so not a separator
    ['example.com:notaport', 'example.com:notaport', undefined],
  ])('%s -> host %s, port %s', (entry, host, port) => {
    expect(splitHostPort(entry)).toEqual(port ? { host, port } : { host });
  });
});

describe('expandAllowedHosts', () => {
  // The issue: the allowlist held "host:8086" while the proxy forwarded
  // "host", so DNS-rebinding protection rejected every external client.
  it('accepts the bare hostname when a port was configured', () => {
    const expanded = expandAllowedHosts(['godot-mcp.software.nuvello.com.br:8086'], 8086);

    expect(expanded).toContain('godot-mcp.software.nuvello.com.br');
    expect(expanded).toContain('godot-mcp.software.nuvello.com.br:8086');
    expect(expanded).toContain('godot-mcp.software.nuvello.com.br:443');
  });

  it('accepts port forms when only the hostname was configured', () => {
    const expanded = expandAllowedHosts(['example.com'], 8086);

    expect(expanded).toEqual(expect.arrayContaining([
      'example.com', 'example.com:443', 'example.com:80', 'example.com:8086',
    ]));
  });

  // The protection must still do its job: only configured hostnames pass.
  it('never widens the set of hostnames', () => {
    const expanded = expandAllowedHosts(['example.com:8086'], 8086);

    expect(expanded.every((entry) => splitHostPort(entry).host === 'example.com')).toBe(true);
    expect(expanded).not.toContain('evil.example.com');
    expect(expanded).not.toContain('attacker.com');
  });

  it('keeps IPv6 literals bracketed', () => {
    expect(expandAllowedHosts(['[::1]:8086'], 8086)).toContain('[::1]');
  });

  it('ignores empty entries', () => {
    expect(expandAllowedHosts([''], 8086)).toEqual([]);
  });
});

describe('displayHost', () => {
  // Publishing the container's internal port sends readers to a closed socket,
  // which is what the landing page did.
  it('drops the internal port', () => {
    expect(displayHost('example.com:8086', 8086)).toBe('example.com');
  });

  it('drops implicit http and https ports', () => {
    expect(displayHost('example.com:443', 8086)).toBe('example.com');
    expect(displayHost('example.com:80', 8086)).toBe('example.com');
  });

  it('keeps a genuinely public non-standard port', () => {
    expect(displayHost('example.com:9000', 8086)).toBe('example.com:9000');
  });

  it('passes a bare hostname through', () => {
    expect(displayHost('example.com', 8086)).toBe('example.com');
  });
});

describe('loadConfig host handling', () => {
  const env = (hosts: string) => loadConfig({
    MCP_TRANSPORT: 'http',
    GODOT_MCP_WORKSPACE: '/workspace',
    MCP_HTTP_PORT: '8086',
    MCP_ALLOWED_HOSTS: hosts,
  });

  // Exactly the deployed configuration: Coolify's SERVICE_FQDN carries the port.
  it('accepts the forwarded bare host for a port-suffixed allowlist', () => {
    const config = env('godot-mcp.software.nuvello.com.br:8086');

    expect(config.http.allowedHosts).toContain('godot-mcp.software.nuvello.com.br');
    expect(config.http.canonicalHost).toBe('godot-mcp.software.nuvello.com.br');
  });

  it('still refuses to start with no configured host', () => {
    expect(() => env('')).toThrow(/requires MCP_ALLOWED_HOSTS/);
  });

  it('keeps every configured hostname', () => {
    const config = env('a.example.com:8086, b.example.com');

    expect(config.http.allowedHosts).toContain('a.example.com');
    expect(config.http.allowedHosts).toContain('b.example.com');
  });
});

describe('expandAllowedOrigins', () => {
  // Same failure mode as the hosts: a browser omits an implicit port.
  it('accepts the port-less origin a browser sends', () => {
    const expanded = expandAllowedOrigins(['https://example.com:8086'], 8086);

    expect(expanded).toContain('https://example.com');
    expect(expanded).toContain('https://example.com:8086');
  });

  it('accepts port forms when only the bare origin was configured', () => {
    const expanded = expandAllowedOrigins(['https://example.com'], 8086);

    expect(expanded).toEqual(expect.arrayContaining([
      'https://example.com', 'https://example.com:443', 'https://example.com:8086',
    ]));
  });

  it('never widens the set of origins', () => {
    const expanded = expandAllowedOrigins(['https://example.com'], 8086);

    expect(expanded.every((entry) => new URL(entry).hostname === 'example.com')).toBe(true);
    expect(expanded).not.toContain('https://evil.example.com');
  });

  it('keeps the scheme distinct', () => {
    expect(expandAllowedOrigins(['https://example.com'], 8086)).not.toContain('http://example.com');
  });

  it('keeps a non-URL entry verbatim rather than dropping it', () => {
    expect(expandAllowedOrigins(['not a url'], 8086)).toEqual(['not a url']);
  });
});
