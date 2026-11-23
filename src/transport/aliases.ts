import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

/**
 * Accept snake_case tool arguments alongside the camelCase contract.
 *
 * Models and clients in the wild send either style. The published inputSchema
 * is camelCase, and it has to stay that way: expressing the aliases with a
 * z.preprocess wrapper makes the SDK emit an empty `properties` object, which
 * leaves callers with no schema at all — worse than the problem.
 *
 * So normalization happens here, before the protocol layer validates.
 */
export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

/**
 * Rewrite only the top-level argument keys.
 *
 * Shallow on purpose: `properties` on add_node holds Godot property names and
 * game data. The previous implementation recursed into it and silently renamed
 * the caller's own keys.
 */
export function normalizeToolArguments(message: JSONRPCMessage): JSONRPCMessage {
  if (!('method' in message) || message.method !== 'tools/call') return message;

  const params = message.params as { arguments?: unknown } | undefined;
  const args = params?.arguments;
  if (!args || typeof args !== 'object' || Array.isArray(args)) return message;

  const source = args as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  let changed = false;

  for (const [key, value] of Object.entries(source)) {
    const camel = snakeToCamel(key);
    // An explicit camelCase key always wins over its snake_case alias
    if (camel !== key && Object.hasOwn(source, camel)) {
      changed = true;
      continue;
    }
    if (camel !== key) changed = true;
    normalized[camel] = value;
  }

  if (!changed) return message;

  return { ...message, params: { ...params, arguments: normalized } } as JSONRPCMessage;
}

/**
 * Install the normalizer on a connected transport.
 *
 * Must run after `server.connect(transport)`: connect installs the protocol's
 * own `onmessage`, which this wraps.
 */
export function installArgumentAliases(transport: Transport): void {
  const downstream = transport.onmessage;

  if (!downstream) {
    throw new Error('installArgumentAliases must be called after server.connect()');
  }

  transport.onmessage = (message, extra) => {
    downstream(normalizeToolArguments(message), extra);
  };
}
