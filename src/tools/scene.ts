import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { textResult } from '../lib/errors.js';
import { assertProjectRelativePath } from '../lib/paths.js';
import {
  guard,
  requireExistingFile,
  requireProject,
  runOperation,
  type ToolContext,
} from './context.js';
import { godotClassName, nodePath, projectPath, scenePath } from './schemas.js';

export function registerSceneTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    'create_scene',
    {
      title: 'Create scene',
      description: 'Create a new Godot scene file with a given root node type',
      inputSchema: {
        projectPath,
        scenePath,
        rootNodeType: godotClassName
          .optional()
          .describe('Root node class, e.g. Node2D or Node3D (default: Node2D)'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    guard('Failed to create the scene', async (args) => {
      const root = requireProject(context, args.projectPath);
      const scene = assertProjectRelativePath(args.scenePath, 'scenePath');
      const rootNodeType = args.rootNodeType ?? 'Node2D';

      await runOperation(context, 'create_scene', { scenePath: scene, rootNodeType }, root, [
        'Check that the root node type is an instantiable Godot class',
        'Verify the project directory is writable',
      ]);

      return textResult(`Scene created at ${scene} with root node type ${rootNodeType}`);
    }),
  );

  server.registerTool(
    'add_node',
    {
      title: 'Add node to scene',
      description: 'Add a node to an existing scene',
      inputSchema: {
        projectPath,
        scenePath,
        nodeType: godotClassName.describe('Node class to add, e.g. Sprite2D'),
        nodeName: z.string().min(1).describe('Name for the new node'),
        parentNodePath: z
          .string()
          .optional()
          .describe('Parent node path, e.g. "root" or "root/Player" (default: "root")'),
        properties: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Properties to set on the new node. A "res://" string value is loaded as a resource.'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    guard('Failed to add the node', async (args) => {
      const root = requireProject(context, args.projectPath);
      const scene = requireExistingFile(root, args.scenePath, 'scenePath');

      const params: Record<string, unknown> = {
        scenePath: scene,
        nodeType: args.nodeType,
        nodeName: args.nodeName,
      };
      if (args.parentNodePath) params.parentNodePath = args.parentNodePath;
      // Passed through untouched: these keys are Godot property names and
      // game data, not part of this server's parameter vocabulary.
      if (args.properties) params.properties = args.properties;

      await runOperation(context, 'add_node', params, root, [
        'Check that the parent node path exists in the scene',
        'Check that the node type is an instantiable Godot class',
      ]);

      return textResult(`Node '${args.nodeName}' of type '${args.nodeType}' added to ${scene}`);
    }),
  );

  server.registerTool(
    'load_sprite',
    {
      title: 'Load sprite texture',
      description: 'Set a texture on a Sprite2D, Sprite3D or TextureRect node',
      inputSchema: {
        projectPath,
        scenePath,
        nodePath,
        texturePath: z
          .string()
          .min(1)
          .describe('Texture file path, relative to the project root'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    guard('Failed to load the sprite', async (args) => {
      const root = requireProject(context, args.projectPath);
      const scene = requireExistingFile(root, args.scenePath, 'scenePath');
      const texture = requireExistingFile(root, args.texturePath, 'texturePath');

      await runOperation(
        context,
        'load_sprite',
        { scenePath: scene, nodePath: args.nodePath, texturePath: texture },
        root,
        [
          'Check that the node path points at a Sprite2D, Sprite3D or TextureRect',
          'Verify the texture is in a format Godot can import',
        ],
      );

      return textResult(`Texture ${texture} set on ${args.nodePath} in ${scene}`);
    }),
  );

  server.registerTool(
    'save_scene',
    {
      title: 'Save scene',
      description: 'Re-save a scene, optionally to a new path to create a variant',
      inputSchema: {
        projectPath,
        scenePath,
        newPath: z
          .string()
          .optional()
          .describe('Save to this path instead, relative to the project root'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    guard('Failed to save the scene', async (args) => {
      const root = requireProject(context, args.projectPath);
      const scene = requireExistingFile(root, args.scenePath, 'scenePath');

      const params: Record<string, unknown> = { scenePath: scene };
      const newPath = args.newPath
        ? assertProjectRelativePath(args.newPath, 'newPath')
        : undefined;
      if (newPath) params.newPath = newPath;

      await runOperation(context, 'save_scene', params, root, [
        'Verify the scene file is valid and can be packed',
        'Check that the destination directory is writable',
      ]);

      return textResult(`Scene saved to ${newPath ?? scene}`);
    }),
  );
}
