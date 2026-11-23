import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { loadConfig } from '../src/config.js';
import { buildServer, type BuiltServer } from '../src/server.js';
import { installArgumentAliases } from '../src/transport/aliases.js';
import { silentLogger } from '../src/lib/log.js';

const EXPECTED_TOOLS = [
  'add_node', 'create_scene', 'export_mesh_library', 'get_debug_output',
  'get_godot_version', 'get_project_info', 'get_uid', 'launch_editor',
  'list_projects', 'load_sprite', 'run_project', 'save_scene',
  'stop_project', 'update_project_uids',
];

let built: BuiltServer;
let client: Client;

beforeEach(async () => {
  built = buildServer(loadConfig({}), silentLogger);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  client = new Client({ name: 'test', version: '1' });
  await Promise.all([built.server.connect(serverTransport), client.connect(clientTransport)]);
  installArgumentAliases(serverTransport);
});

afterEach(async () => {
  await client.close();
  await built.dispose();
});

describe('tool surface', () => {
  it('exposes every documented tool', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(EXPECTED_TOOLS);
  });

  // z.preprocess would have produced an empty `properties` here, leaving
  // clients with no contract at all.
  it('publishes a usable input schema for every tool', async () => {
    const { tools } = await client.listTools();

    for (const tool of tools) {
      expect(tool.inputSchema, tool.name).toBeDefined();
      expect(tool.inputSchema.type, tool.name).toBe('object');
      expect(tool.description, tool.name).toBeTruthy();
    }

    const createScene = tools.find((t) => t.name === 'create_scene')!;
    expect(Object.keys(createScene.inputSchema.properties ?? {}).sort()).toEqual([
      'projectPath', 'rootNodeType', 'scenePath',
    ]);
  });

  it('keeps the README tool list in sync with the server', async () => {
    const { tools } = await client.listTools();
    const readme = readFileSync('README.md', 'utf8');

    for (const tool of tools) {
      expect(readme, `README is missing ${tool.name}`).toContain(tool.name);
    }
  });
});

describe('argument validation', () => {
  it('rejects a missing required argument', async () => {
    const result = await client.callTool({ name: 'create_scene', arguments: {} });
    expect(result.isError).toBe(true);
  });

  // The guard against arbitrary script instantiation: a path-shaped class name
  // would let a caller run any script in the project.
  it.each(['res://evil.gd', '../evil.gd', 'Node2D.gd', 'a/b', 'Node:2D'])(
    'rejects %s as a node type',
    async (nodeType) => {
      const result = await client.callTool({
        name: 'add_node',
        arguments: { projectPath: '/nope', scenePath: 'a.tscn', nodeType, nodeName: 'X' },
      });
      expect(result.isError).toBe(true);
    },
  );

  it('rejects a project path that is not a Godot project', async () => {
    const result = await client.callTool({
      name: 'get_project_info',
      arguments: { projectPath: '/definitely/not/a/project' },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Not a Godot project');
  });

  it('accepts snake_case argument names', async () => {
    const result = await client.callTool({
      name: 'get_project_info',
      arguments: { project_path: '/definitely/not/a/project' },
    });

    // Reaches the project check rather than failing schema validation, which
    // is what proves the alias shim ran.
    expect(JSON.stringify(result.content)).toContain('Not a Godot project');
  });
});

describe('packaging', () => {
  it('has no CommonJS require() calls in source', () => {
    // require() throws in an ESM module. One such call sat inside a silent
    // catch for a long time, disabling a feature outright.
    const offenders: string[] = [];

    const scan = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(path);
        } else if (entry.name.endsWith('.ts')) {
          readFileSync(path, 'utf8').split('\n').forEach((line, index) => {
            const code = line.trim();
            if (code.startsWith('*') || code.startsWith('//')) return;
            if (/\brequire\s*\(\s*['"]/.test(code)) offenders.push(`${path}:${index + 1}`);
          });
        }
      }
    };

    scan('src');
    expect(offenders).toEqual([]);
  });
});
