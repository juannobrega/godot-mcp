import { describe, expect, it } from 'vitest';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

import { normalizeToolArguments, snakeToCamel } from '../src/transport/aliases.js';

const call = (args: Record<string, unknown>): JSONRPCMessage =>
  ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'x', arguments: args } }) as JSONRPCMessage;

const argsOf = (message: JSONRPCMessage) =>
  (message as { params: { arguments: Record<string, unknown> } }).params.arguments;

describe('snakeToCamel', () => {
  it('converts snake_case segments', () => {
    expect(snakeToCamel('project_path')).toBe('projectPath');
    expect(snakeToCamel('root_node_type')).toBe('rootNodeType');
    expect(snakeToCamel('mesh_item_names')).toBe('meshItemNames');
  });

  it('leaves camelCase and single words alone', () => {
    expect(snakeToCamel('projectPath')).toBe('projectPath');
    expect(snakeToCamel('recursive')).toBe('recursive');
  });
});

describe('normalizeToolArguments', () => {
  it('renames snake_case argument keys', () => {
    const out = normalizeToolArguments(call({ project_path: '/a', root_node_type: 'Node2D' }));
    expect(argsOf(out)).toEqual({ projectPath: '/a', rootNodeType: 'Node2D' });
  });

  it('leaves camelCase arguments untouched', () => {
    const input = call({ projectPath: '/a' });
    expect(normalizeToolArguments(input)).toBe(input);
  });

  it('prefers an explicit camelCase key over its snake_case alias', () => {
    const out = normalizeToolArguments(call({ projectPath: '/win', project_path: '/lose' }));
    expect(argsOf(out)).toEqual({ projectPath: '/win' });
  });

  // This is the regression the old recursive converter caused: `properties`
  // holds Godot property names and the caller's game data, not our vocabulary.
  it('does not rewrite keys nested inside properties', () => {
    const out = normalizeToolArguments(
      call({ scene_path: 'a.tscn', properties: { my_custom_key: 1, anotherKey: { deep_key: 2 } } }),
    );

    expect(argsOf(out)).toEqual({
      scenePath: 'a.tscn',
      properties: { my_custom_key: 1, anotherKey: { deep_key: 2 } },
    });
  });

  it('ignores messages that are not tool calls', () => {
    const other = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} } as JSONRPCMessage;
    expect(normalizeToolArguments(other)).toBe(other);
  });

  it('tolerates a missing or non-object arguments field', () => {
    const noArgs = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'x' } } as JSONRPCMessage;
    expect(normalizeToolArguments(noArgs)).toBe(noArgs);
  });
});
