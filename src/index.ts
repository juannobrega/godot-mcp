#!/usr/bin/env node
/**
 * Godot MCP server.
 *
 * Exposes the Godot engine to MCP clients: launching the editor, running
 * projects and reading their output, and editing scenes through a bundled
 * GDScript that receives its operation and parameters as JSON.
 */
import { loadConfig } from './config.js';
import { createLogger } from './lib/log.js';
import { buildServer } from './server.js';
import { serveHttp } from './transport/http.js';
import { serveStdio } from './transport/stdio.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.debug);
  const built = buildServer(config, logger);

  // Probe Godot before serving, so a bad install fails here with a clear
  // message instead of on every later tool call.
  try {
    await built.godotReady();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);

    if (config.strictPathValidation) {
      await built.dispose();
      process.exit(1);
    }

    logger.warn('Starting anyway; Godot-backed tools will fail until GODOT_PATH is correct');
  }

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);
    await built.dispose().catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  if (config.transport === 'http') {
    await serveHttp(built, config);
    return;
  }

  await serveStdio(built);
}

main().catch((error: unknown) => {
  console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
