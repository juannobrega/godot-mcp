import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { jsonResult, textResult } from '../lib/errors.js';
import { assertProjectRelativePath } from '../lib/paths.js';
import { guard, requireProject, type ToolContext } from './context.js';
import { projectPath } from './schemas.js';

export function registerRunTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    'run_project',
    {
      title: 'Run Godot project',
      description: 'Run a Godot project in debug mode and start capturing its output',
      inputSchema: {
        projectPath,
        scene: z
          .string()
          .optional()
          .describe('Optional specific scene to run, relative to the project root'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    guard('Failed to run the Godot project', async ({ projectPath: requested, scene }) => {
      const root = requireProject(context, requested);
      const godotPath = await context.godot.resolvePath();
      const relativeScene = scene ? assertProjectRelativePath(scene, 'scene') : undefined;

      context.runner.start(godotPath, root, relativeScene);

      return textResult(
        `Godot project started in debug mode${relativeScene ? ` (scene: ${relativeScene})` : ''}. ` +
          'Use get_debug_output to read its output, stop_project to end it.',
      );
    }),
  );

  server.registerTool(
    'get_debug_output',
    {
      title: 'Get debug output',
      description: 'Read the captured output and errors of the running Godot project',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard('Failed to read debug output', async () => {
      const running = context.runner.require();

      return jsonResult({
        projectPath: running.projectPath,
        scene: running.scene,
        output: running.output(),
        errors: running.errors(),
      });
    }),
  );

  server.registerTool(
    'stop_project',
    {
      title: 'Stop Godot project',
      description: 'Stop the running Godot project and return its final output',
      inputSchema: {},
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    guard('Failed to stop the Godot project', async () => {
      const final = context.runner.stop();

      return jsonResult({
        message: 'Godot project stopped',
        finalOutput: final.output,
        finalErrors: final.errors,
      });
    }),
  );
}
