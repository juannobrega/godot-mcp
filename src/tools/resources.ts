import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { ToolError, textResult } from '../lib/errors.js';
import { assertProjectRelativePath } from '../lib/paths.js';
import {
  guard,
  requireExistingFile,
  requireProject,
  runOperation,
  type ToolContext,
} from './context.js';
import { projectPath, scenePath } from './schemas.js';

/** Both UID tools need the same version gate. */
async function requireUidSupport(context: ToolContext): Promise<void> {
  if (await context.godot.supportsUids()) return;

  const version = await context.godot.version();
  throw new ToolError(`UIDs require Godot 4.4 or later, but this is ${version}`, [
    'Upgrade Godot to 4.4 or later',
    'Reference resources by path instead of UID on this version',
  ]);
}

export function registerResourceTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    'export_mesh_library',
    {
      title: 'Export MeshLibrary',
      description: 'Export a 3D scene as a MeshLibrary resource for use with GridMap',
      inputSchema: {
        projectPath,
        scenePath,
        outputPath: z
          .string()
          .min(1)
          .describe('Where to write the .res MeshLibrary, relative to the project root'),
        meshItemNames: z
          .array(z.string())
          .optional()
          .describe('Only include these mesh items (default: all)'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    guard('Failed to export the MeshLibrary', async (args) => {
      const root = requireProject(context, args.projectPath);
      const scene = requireExistingFile(root, args.scenePath, 'scenePath');
      const output = assertProjectRelativePath(args.outputPath, 'outputPath');

      const params: Record<string, unknown> = { scenePath: scene, outputPath: output };
      if (args.meshItemNames?.length) params.meshItemNames = args.meshItemNames;

      await runOperation(context, 'export_mesh_library', params, root, [
        'Check that the scene contains MeshInstance3D nodes with meshes',
        'Verify the output directory is writable',
      ]);

      return textResult(`MeshLibrary exported to ${output}`);
    }),
  );

  server.registerTool(
    'get_uid',
    {
      title: 'Get resource UID',
      description: 'Get the Godot UID of a file in the project (Godot 4.4+)',
      inputSchema: {
        projectPath,
        filePath: z
          .string()
          .min(1)
          .describe('File path, relative to the project root'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard('Failed to get the UID', async (args) => {
      const root = requireProject(context, args.projectPath);
      await requireUidSupport(context);
      const file = requireExistingFile(root, args.filePath, 'filePath');

      const result = await runOperation(context, 'get_uid', { filePath: file }, root, [
        'Check that the file is a Godot resource',
        'Run update_project_uids to generate missing UID files',
      ]);

      return textResult(extractJsonLine(result.stdout) ?? result.stdout.trim());
    }),
  );

  server.registerTool(
    'update_project_uids',
    {
      title: 'Update project UIDs',
      description: 'Re-save project resources to refresh UID references (Godot 4.4+)',
      inputSchema: { projectPath },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    guard('Failed to update project UIDs', async ({ projectPath: requested }) => {
      const root = requireProject(context, requested);
      await requireUidSupport(context);

      // Deliberately no path parameter: the operations script resolves against
      // res://, which --path already points at the project. A host path sent
      // here was prefixed with res:// and matched nothing while reporting success.
      await runOperation(context, 'resave_resources', {}, root, [
        'Verify the project directory is writable',
      ]);

      return textResult(`Project UIDs updated for ${root}`);
    }),
  );
}

/**
 * The operations script prints human-readable progress before its JSON result,
 * so return just the JSON object rather than the whole transcript.
 */
function extractJsonLine(stdout: string): string | null {
  for (const line of stdout.split('\n').reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      // Not the JSON line after all; keep looking
    }
  }
  return null;
}
