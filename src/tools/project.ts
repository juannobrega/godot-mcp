import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { jsonResult, textResult } from '../lib/errors.js';
import { resolveProjectPath } from '../lib/paths.js';
import { describeStructure, findProjects, readProjectName } from '../godot/scan.js';
import { guard, requireProject, type ToolContext } from './context.js';
import { projectPath } from './schemas.js';

export function registerProjectTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    'get_godot_version',
    {
      title: 'Get Godot version',
      description: 'Report the version of the Godot executable this server uses',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard('Failed to get the Godot version', async () => {
      return textResult(await context.godot.version());
    }),
  );

  server.registerTool(
    'list_projects',
    {
      title: 'List Godot projects',
      description: 'Find Godot projects in a directory',
      inputSchema: {
        directory: z.string().min(1).describe('Directory to search'),
        recursive: z
          .boolean()
          .optional()
          .describe('Search nested directories as well (default: false)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard('Failed to list Godot projects', async ({ directory, recursive }) => {
      // Reuse the project-path resolver so the workspace confinement that
      // applies to tool targets also applies to discovery.
      const root = resolveProjectPath(directory, context.config.workspaceRoot);

      const projects = findProjects(
        root,
        recursive === true,
        context.config.maxScanDepth,
        context.logger,
      );

      return jsonResult(projects);
    }),
  );

  server.registerTool(
    'get_project_info',
    {
      title: 'Get project info',
      description: 'Report a Godot project name, path, engine version and file counts',
      inputSchema: { projectPath },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard('Failed to get project info', async ({ projectPath: requested }) => {
      const root = requireProject(context, requested);

      return jsonResult({
        name: readProjectName(root),
        path: root,
        godotVersion: await context.godot.version(),
        structure: describeStructure(root, context.config.maxScanDepth, context.logger),
      });
    }),
  );
}
