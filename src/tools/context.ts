import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { ServerConfig } from '../config.js';
import type { Logger } from '../lib/log.js';
import { ToolError, toErrorResult } from '../lib/errors.js';
import { assertProjectRelativePath, resolveProjectPath } from '../lib/paths.js';
import { GodotBinary, operationFailed, type OperationResult } from '../godot/binary.js';
import { ProjectRunner } from '../godot/process.js';
import { isGodotProject } from '../godot/scan.js';

export interface ToolContext {
  readonly config: ServerConfig;
  readonly logger: Logger;
  readonly godot: GodotBinary;
  readonly runner: ProjectRunner;
}

/**
 * Resolve a caller-supplied project path and confirm it is a Godot project.
 *
 * Every tool needs exactly this, which is why the check used to be pasted into
 * ten handlers.
 */
export function requireProject(context: ToolContext, projectPath: string): string {
  const resolved = resolveProjectPath(projectPath, context.config.workspaceRoot);

  if (!isGodotProject(resolved)) {
    throw new ToolError(`Not a Godot project: ${resolved}`, [
      'Point projectPath at a directory containing a project.godot file',
      'Use list_projects to find valid projects',
    ]);
  }

  return resolved;
}

/** Resolve a project-relative path and require that it already exists. */
export function requireExistingFile(
  projectRoot: string,
  candidate: string,
  label: string,
): string {
  const relative = assertProjectRelativePath(candidate, label);

  if (!existsSync(join(projectRoot, relative))) {
    throw new ToolError(`${label} does not exist: ${relative}`, [
      `Check that ${relative} exists inside the project`,
      'Use create_scene to create a scene first',
    ]);
  }

  return relative;
}

/**
 * Run an operation and raise a ToolError when it failed, so each tool only
 * describes what success looks like.
 */
export async function runOperation(
  context: ToolContext,
  operation: string,
  params: Record<string, unknown>,
  projectRoot: string,
  failureHints: string[],
): Promise<OperationResult> {
  const result = await context.godot.runOperation(operation, params, projectRoot);

  if (operationFailed(result)) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`;
    throw new ToolError(detail, failureHints);
  }

  return result;
}

/**
 * Wrap a tool handler so anything thrown becomes a tool result instead of a
 * protocol error, keeping the model able to react to it.
 */
export function guard<Args>(
  description: string,
  handler: (args: Args) => Promise<CallToolResult>,
): (args: Args) => Promise<CallToolResult> {
  return async (args: Args) => {
    try {
      return await handler(args);
    } catch (error) {
      return toErrorResult(error, description);
    }
  };
}
