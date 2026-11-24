import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ServerConfig } from './config.js';
import { SERVER_VERSION } from './version.js';
import { createLogger, type Logger } from './lib/log.js';
import { GodotBinary } from './godot/binary.js';
import { ProjectRunner } from './godot/process.js';
import type { ToolContext } from './tools/context.js';
import { registerEditorTools } from './tools/editor.js';
import { registerProjectTools } from './tools/project.js';
import { registerResourceTools } from './tools/resources.js';
import { registerRunTools } from './tools/run.js';
import { registerSceneTools } from './tools/scene.js';

const SERVER_NAME = 'godot-mcp';

const moduleDir = dirname(fileURLToPath(import.meta.url));

/** The bundled GDScript, copied next to the compiled output at build time. */
export function operationsScriptPath(): string {
  return join(moduleDir, 'scripts', 'godot_operations.gd');
}

export interface BuiltServer {
  server: McpServer;
  context: ToolContext;
  logger: Logger;
  /** Resolve and probe the Godot executable, throwing if none is usable. */
  godotReady(): Promise<string>;
  dispose(): Promise<void>;
}

export function buildServer(config: ServerConfig, logger: Logger = createLogger(config.debug)): BuiltServer {
  const godot = new GodotBinary(config, logger, operationsScriptPath());
  const runner = new ProjectRunner(logger, config.maxOutputLines);
  const context: ToolContext = { config, logger, godot, runner };

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  // Gated: these drive a Godot process that needs a display. See
  // ServerConfig.processTools for why the default follows the transport.
  if (config.processTools) {
    registerEditorTools(server, context);
    registerRunTools(server, context);
  }

  registerProjectTools(server, context);
  registerSceneTools(server, context);
  registerResourceTools(server, context);

  return {
    server,
    context,
    logger,
    godotReady: () => godot.verifyAvailable(),
    dispose: async () => {
      runner.dispose();
      await server.close();
    },
  };
}
