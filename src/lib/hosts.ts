/**
 * Host allowlist handling for the HTTP transport.
 *
 * DNS-rebinding protection exists to stop a page on an attacker's domain from
 * driving this server through a visitor's browser. What identifies the
 * attacker is the *hostname*; the port carries no such meaning. So accepting
 * every port form of a hostname that was explicitly configured is safe, while
 * refusing them is merely brittle: a reverse proxy may forward
 * "example.com", "example.com:443" or "example.com:8086" for the very same
 * deployment, and only one of those will match a literal allowlist.
 */

/** Ports that are implicit in a URL and so usually absent from a Host header. */
const IMPLICIT_PORTS = new Set(['80', '443']);

export interface HostParts {
  host: string;
  port?: string;
}

/** Split "example.com:8086" or "[::1]:8086" into its parts. */
export function splitHostPort(entry: string): HostParts {
  // IPv6 literals are bracketed, so the colons inside them are not separators
  const bracketed = entry.match(/^(\[[^\]]+\])(?::(\d+))?$/);
  if (bracketed) {
    return { host: bracketed[1], port: bracketed[2] };
  }

  const separator = entry.lastIndexOf(':');
  if (separator > 0 && /^\d+$/.test(entry.slice(separator + 1))) {
    return { host: entry.slice(0, separator), port: entry.slice(separator + 1) };
  }

  return { host: entry };
}

/**
 * Expand configured hosts into every port form a proxy might forward.
 *
 * Only hostnames that were configured are ever added, so this widens the
 * accepted ports and never the accepted hosts.
 */
export function expandAllowedHosts(configured: string[], internalPort: number): string[] {
  const expanded = new Set<string>();

  for (const entry of configured) {
    const { host } = splitHostPort(entry);
    if (!host) continue;

    expanded.add(entry);
    expanded.add(host);
    expanded.add(`${host}:443`);
    expanded.add(`${host}:80`);
    expanded.add(`${host}:${internalPort}`);
  }

  return [...expanded];
}

/**
 * The hostname to print in documentation and connection snippets.
 *
 * Strips a port that cannot be the public one: an implicit 80/443, or the
 * container's own internal port, which is what the reverse proxy connects to
 * rather than what a client dials. Publishing the internal port sends readers
 * to a closed socket.
 */
export function displayHost(entry: string, internalPort: number): string {
  const { host, port } = splitHostPort(entry);
  if (!port) return host;
  if (IMPLICIT_PORTS.has(port) || port === String(internalPort)) return host;

  return `${host}:${port}`;
}

/**
 * Expand configured origins the same way, for the same reason.
 *
 * A browser sends `Origin: https://example.com` with no port when the port is
 * implicit, so an allowlist holding `https://example.com:8086` would reject
 * every browser-based client.
 */
export function expandAllowedOrigins(configured: string[], internalPort: number): string[] {
  const expanded = new Set<string>();

  for (const entry of configured) {
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      // Not a URL; keep it verbatim rather than silently dropping it
      expanded.add(entry);
      continue;
    }

    const scheme = url.protocol;
    const host = url.hostname.includes(':') ? `[${url.hostname}]` : url.hostname;

    expanded.add(entry);
    expanded.add(`${scheme}//${host}`);
    expanded.add(`${scheme}//${host}:443`);
    expanded.add(`${scheme}//${host}:80`);
    expanded.add(`${scheme}//${host}:${internalPort}`);
  }

  return [...expanded];
}
