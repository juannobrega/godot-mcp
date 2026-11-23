import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import type { BuiltServer } from '../server.js';
import { installArgumentAliases } from './aliases.js';

export async function serveStdio(built: BuiltServer): Promise<void> {
  const transport = new StdioServerTransport();
  await built.server.connect(transport);
  installArgumentAliases(transport);

  built.logger.info('Godot MCP server listening on stdio');
}
