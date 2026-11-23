import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
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

  it('refuses a scene path that escapes the project', async () => {
    const result = await client.callTool({
      name: 'create_scene',
      arguments: { projectPath: project, scenePath: '../../escaped.tscn' },
    });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain('escapes the project');
  });
});
