import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { loadConfig } from '../src/config.js';
import { buildServer, type BuiltServer } from '../src/server.js';
import { installArgumentAliases } from '../src/transport/aliases.js';
import { silentLogger } from '../src/lib/log.js';

/**
 * These exercise the bundled GDScript against a real engine. Without Godot
 * installed they are skipped rather than failed, so the unit suite still runs
 * anywhere.
 */
function findGodot(): string | null {
  const explicit = process.env.GODOT_PATH;
  if (explicit && existsSync(explicit)) return explicit;

  for (const candidate of ['/usr/local/bin/godot', '/usr/bin/godot']) {
    if (existsSync(candidate)) return candidate;
  }

  try {
    return execFileSync('which', ['godot'], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

const godotPath = findGodot();
const describeE2E = godotPath ? describe : describe.skip;

describeE2E('end to end against a real Godot', () => {
  let built: BuiltServer;
  let client: Client;
  let project: string;

  beforeAll(async () => {
    project = join(mkdtempSync(join(tmpdir(), 'godot-mcp-e2e-')), 'game');
    mkdirSync(project, { recursive: true });
    writeFileSync(
      join(project, 'project.godot'),
      'config_version=5\n\n[application]\n\nconfig/name="Projeto E2E"\nconfig/features=PackedStringArray("4.3")\n',
    );

    // A symlink cycle, so the scan guards are exercised by the real tools
    mkdirSync(join(project, 'sub'), { recursive: true });
    symlinkSync(project, join(project, 'sub', 'loop'));

    built = buildServer(loadConfig({ GODOT_PATH: godotPath! }), silentLogger);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'e2e', version: '1' });
    await Promise.all([built.server.connect(serverTransport), client.connect(clientTransport)]);
    installArgumentAliases(serverTransport);
  });

  afterAll(async () => {
    await client?.close();
    await built?.dispose();
  });

  const text = (result: Awaited<ReturnType<Client['callTool']>>) =>
    JSON.stringify(result.content);

  it('reports the Godot version', async () => {
    const result = await client.callTool({ name: 'get_godot_version', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toMatch(/\d+\.\d+/);
  });

  it('reads the configured project name', async () => {
    const result = await client.callTool({
      name: 'get_project_info',
      arguments: { projectPath: project },
    });

    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain('Projeto E2E');
  });

  it('creates a scene without leaving temp files in the project', async () => {
    const result = await client.callTool({
      name: 'create_scene',
      arguments: { projectPath: project, scenePath: 'scenes/Main.tscn', rootNodeType: 'Node2D' },
    });

    expect(result.isError, text(result)).toBeFalsy();
    expect(existsSync(join(project, 'scenes', 'Main.tscn'))).toBe(true);
    // Godot debug mode used to write these into the user's project every time
    expect(readdirSync(project).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('adds a node to the scene', async () => {
    const result = await client.callTool({
      name: 'add_node',
      arguments: {
        projectPath: project,
        scenePath: 'scenes/Main.tscn',
        nodeType: 'Sprite2D',
        nodeName: 'Hero',
      },
    });

    expect(result.isError, text(result)).toBeFalsy();
    expect(text(result)).toContain('Hero');
  });

  // The failure that used to be reported as success: quit(1) neither stopped
  // the GDScript function nor survived the quit() at the end of _init().
  it('reports a missing parent node as an error', async () => {
    const result = await client.callTool({
      name: 'add_node',
      arguments: {
        projectPath: project,
        scenePath: 'scenes/Main.tscn',
        parentNodePath: 'root/DoesNotExist',
        nodeType: 'Sprite2D',
        nodeName: 'Orphan',
      },
    });

    expect(result.isError).toBe(true);
  });

  it('saves a scene variant', async () => {
    const result = await client.callTool({
      name: 'save_scene',
      arguments: {
        projectPath: project,
        scenePath: 'scenes/Main.tscn',
        newPath: 'scenes/Main.variant.tscn',
      },
    });

    expect(result.isError, text(result)).toBeFalsy();
    expect(existsSync(join(project, 'scenes', 'Main.variant.tscn'))).toBe(true);
  });

  it('lists the project recursively despite a symlink cycle', async () => {
    const result = await client.callTool({
      name: 'list_projects',
      arguments: { directory: project, recursive: true },
    });

    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain('Projeto E2E');
  });

  it('runs update_project_uids against the project', async () => {
    const supported = await built.context.godot.supportsUids();
    const result = await client.callTool({
      name: 'update_project_uids',
      arguments: { projectPath: project },
    });

    // Below 4.4 the correct outcome is a clear version error, not a silent no-op
    expect(result.isError ?? false).toBe(!supported);
  });

  it('loads a texture into a sprite node', async () => {
    // An 8x8 RGBA PNG. A 1x1 image is rejected by Godot's texture
    // importer (it writes valid=false and no .ctex), so the fixture has to be
    // large enough to actually import.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAgUlEQVR4nBXOQREAQAjDQKQgBSlIqRSkIAUnvdxzZ/JIRMgZcoXcIQsPXnw4IuVMuVLulIUHL778QclZcpXcJQsPXnz1g5az5Wq5WxYevPj6B+JBPIgH8YAHLz79YHgYHoaH4QEPXnzzg+VheVgelgc8ePHtD46H4+F4OB7w4MWHH/qRl8FweERHAAAAAElFTkSuQmCC',
      'base64',
    );
    mkdirSync(join(project, 'art'), { recursive: true });
    writeFileSync(join(project, 'art', 'dot.png'), png);

    const result = await client.callTool({
      name: 'load_sprite',
      arguments: {
        projectPath: project,
        scenePath: 'scenes/Main.tscn',
        nodePath: 'root/Hero',
        texturePath: 'art/dot.png',
      },
    });

    expect(result.isError, text(result)).toBeFalsy();
  });

  it('rejects loading a texture into a node that cannot hold one', async () => {
    const result = await client.callTool({
      name: 'load_sprite',
      arguments: {
        projectPath: project,
        scenePath: 'scenes/Main.tscn',
        nodePath: 'root',
        texturePath: 'art/dot.png',
      },
    });

    expect(result.isError).toBe(true);
  });

  it('reports a UID lookup for a project file', async () => {
    writeFileSync(join(project, 'player.gd'), 'extends Node');
    const supported = await built.context.godot.supportsUids();

    const result = await client.callTool({
      name: 'get_uid',
      arguments: { projectPath: project, filePath: 'player.gd' },
    });

    if (supported) {
      expect(result.isError, text(result)).toBeFalsy();
      expect(text(result)).toContain('player.gd');
    } else {
      expect(result.isError).toBe(true);
    }
  });

  // A 2D scene has no meshes, so the correct outcome is a reported failure
  // rather than an empty MeshLibrary written to disk.
  it('reports a MeshLibrary export with no meshes as an error', async () => {
    const result = await client.callTool({
      name: 'export_mesh_library',
      arguments: {
        projectPath: project,
        scenePath: 'scenes/Main.tscn',
        outputPath: 'meshes/empty.res',
      },
    });

    expect(result.isError).toBe(true);
    expect(existsSync(join(project, 'meshes', 'empty.res'))).toBe(false);
  });

  // The success path: a 3D scene whose children carry real meshes. Previously
  // only the empty case was covered, which is how the silent-success bug in
  // export_mesh_library survived.
  describe('export_mesh_library with real meshes', () => {
    // A real BoxMesh resource, so the exported library has actual geometry
    const boxResource = join(import.meta.dirname, 'fixtures', 'box.tres');

    beforeAll(async () => {
      mkdirSync(join(project, 'meshes'), { recursive: true });
      copyFileSync(boxResource, join(project, 'meshes', 'box.tres'));

      await client.callTool({
        name: 'create_scene',
        arguments: { projectPath: project, scenePath: 'scenes/World.tscn', rootNodeType: 'Node3D' },
      });

      for (const name of ['Cube', 'Pillar']) {
        await client.callTool({
          name: 'add_node',
          arguments: {
            projectPath: project,
            scenePath: 'scenes/World.tscn',
            nodeType: 'MeshInstance3D',
            nodeName: name,
            properties: { mesh: 'res://meshes/box.tres' },
          },
        });
      }
    });

    it('exports every mesh in the scene', async () => {
      const result = await client.callTool({
        name: 'export_mesh_library',
        arguments: {
          projectPath: project,
          scenePath: 'scenes/World.tscn',
          outputPath: 'meshes/world.res',
        },
      });

      expect(result.isError, text(result)).toBeFalsy();
      expect(existsSync(join(project, 'meshes', 'world.res'))).toBe(true);
      expect(statSync(join(project, 'meshes', 'world.res')).size).toBeGreaterThan(0);
    });

    it('exports only the named meshes when filtered', async () => {
      const result = await client.callTool({
        name: 'export_mesh_library',
        arguments: {
          projectPath: project,
          scenePath: 'scenes/World.tscn',
          outputPath: 'meshes/just-cube.res',
          meshItemNames: ['Cube'],
        },
      });

      expect(result.isError, text(result)).toBeFalsy();
      expect(existsSync(join(project, 'meshes', 'just-cube.res'))).toBe(true);
    });

    it('creates the output directory when it does not exist', async () => {
      const result = await client.callTool({
        name: 'export_mesh_library',
        arguments: {
          projectPath: project,
          scenePath: 'scenes/World.tscn',
          outputPath: 'generated/nested/lib.res',
        },
      });

      expect(result.isError, text(result)).toBeFalsy();
      expect(existsSync(join(project, 'generated', 'nested', 'lib.res'))).toBe(true);
    });

    it('reports a filter that matches nothing as an error', async () => {
      const result = await client.callTool({
        name: 'export_mesh_library',
        arguments: {
          projectPath: project,
          scenePath: 'scenes/World.tscn',
          outputPath: 'meshes/nothing.res',
          meshItemNames: ['NoSuchNode'],
        },
      });

      expect(result.isError).toBe(true);
      expect(existsSync(join(project, 'meshes', 'nothing.res'))).toBe(false);
    });
  });

  it('refuses a scene path that escapes the project', async () => {
    const result = await client.callTool({
      name: 'create_scene',
      arguments: { projectPath: project, scenePath: '../../escaped.tscn' },
    });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain('escapes the project');
  });
});
