import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import type { ServerConfig } from '../config.js';
import type { Logger } from '../lib/log.js';
import { buildServer } from '../server.js';

export interface ToolParameter {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface ToolInfo {
  name: string;
  title?: string;
  description?: string;
  readOnly: boolean;
  parameters: ToolParameter[];
}

/**
 * Ask the server what tools it exposes, through the protocol.
 *
 * Going through a real client rather than a hand-written list means the
 * documentation cannot drift: it renders exactly what a connecting client
 * sees, including the schema this configuration actually produces (which
 * differs by transport, since the process tools are gated).
 */
export async function introspectTools(
  config: ServerConfig,
  logger: Logger,
): Promise<ToolInfo[]> {
  // A throwaway instance: the live servers are per-session and must not have a
  // second client attached to them.
  const probe = buildServer(config, logger);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'godot-mcp-docs', version: '1' });

  try {
    await Promise.all([probe.server.connect(serverTransport), client.connect(clientTransport)]);
    const { tools } = await client.listTools();

    return tools
      .map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        readOnly: tool.annotations?.readOnlyHint === true,
        parameters: describeParameters(tool.inputSchema),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    await client.close().catch(() => {});
    await probe.dispose().catch(() => {});
  }
}

/** Flatten a tool's JSON Schema into a list the page can render. */
function describeParameters(schema: unknown): ToolParameter[] {
  if (!schema || typeof schema !== 'object') return [];

  const { properties, required } = schema as {
    properties?: Record<string, { type?: string; description?: string; items?: { type?: string } }>;
    required?: string[];
  };
  if (!properties) return [];

  const requiredNames = new Set(required ?? []);

  return Object.entries(properties).map(([name, property]) => ({
    name,
    type: describeType(property),
    required: requiredNames.has(name),
    description: property.description,
  }));
}

function describeType(property: { type?: string; items?: { type?: string } }): string {
  if (property.type === 'array') {
    return `${property.items?.type ?? 'any'}[]`;
  }
  return property.type ?? 'any';
}
