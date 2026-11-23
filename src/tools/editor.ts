import { spawn } from 'node:child_process';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { textResult } from '../lib/errors.js';
import { guard, requireProject, type ToolContext } from './context.js';
import { projectPath } from './schemas.js';

export function registerEditorTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    'launch_editor',
    {
      title: 'Launch Godot editor',
      description: 'Open the Godot editor for a project',
      inputSchema: { projectPath },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    guard('Failed to launch the Godot editor', async ({ projectPath: requested }) => {
      const root = requireProject(context, requested);
      const godotPath = await context.godot.resolvePath();

      // Detached and unwatched: the editor outlives this tool call, and
      // holding its pipes open would keep the server waiting on a GUI app.
      const editor = spawn(godotPath, ['-e', '--path', root], {
        stdio: 'ignore',
        detached: true,
      });
      editor.on('error', (error) => {
        context.logger.error(`Godot editor failed to start: ${error.message}`);
      });
      editor.unref();

      return textResult(`Godot editor launched for ${root}`);
    }),
  );
}
