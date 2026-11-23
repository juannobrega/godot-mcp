import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';

import { ToolError } from './errors.js';

/** Windows drive-letter prefix, which `isAbsolute` misses on POSIX hosts. */
const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/;

/**
 * Validate a path that must stay inside the project it belongs to.
 *
 * Scene, texture and output paths are project-relative: the operations script
 * resolves them against `res://`. The old check rejected any path containing
 * ".." as a substring, which both refused legitimate names like
 * "my..scene.tscn" and said nothing about where the path actually landed.
 * Normalizing first and then inspecting the result gets both cases right.
 */
export function assertProjectRelativePath(candidate: string, label: string): string {
  if (!candidate || !candidate.trim()) {
    throw new ToolError(`${label} must not be empty`);
  }

  // Callers may pass either "res://scenes/Main.tscn" or "scenes/Main.tscn"
  const stripped = candidate.replace(/^res:\/\//, '');

  if (isAbsolute(stripped) || WINDOWS_DRIVE.test(stripped)) {
    throw new ToolError(
      `${label} must be relative to the project, but got an absolute path: ${candidate}`,
      ['Pass a path relative to the project root, e.g. "scenes/Main.tscn"'],
    );
  }

  // Normalize to collapse "a/../b" before deciding whether it escapes
  const normalized = normalize(stripped).split(sep).join('/');

  if (normalized === '..' || normalized.startsWith('../')) {
    throw new ToolError(
      `${label} escapes the project directory: ${candidate}`,
      ['Pass a path that stays inside the project root'],
    );
  }

  return normalized;
}

/**
 * Resolve a project directory, optionally confining it to a workspace root.
 *
 * The workspace root matters for the HTTP transport: a server reachable over
 * the network must not be able to read or write arbitrary paths on its host,
 * so every project it touches has to live under one mounted directory.
 */
export function resolveProjectPath(candidate: string, workspaceRoot?: string): string {
  if (!candidate || !candidate.trim()) {
    throw new ToolError('projectPath must not be empty');
  }

  const resolved = workspaceRoot
    ? resolve(workspaceRoot, candidate)
    : resolve(candidate);

  if (!workspaceRoot) {
    return resolved;
  }

  // Compare canonical paths so a symlink cannot point out of the workspace
  const canonicalRoot = canonicalize(workspaceRoot);
  const canonicalTarget = canonicalize(resolved);
  const rel = relative(canonicalRoot, canonicalTarget);

  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new ToolError(
      `projectPath is outside the configured workspace: ${candidate}`,
      [
        `This server only serves projects under ${workspaceRoot}`,
        'Pass a path relative to that workspace root',
      ],
    );
  }

  return resolved;
}

/**
 * Resolve to a canonical path, resolving symlinks for whatever prefix exists.
 * A path that does not exist yet still needs its existing parent canonicalized,
 * otherwise a symlinked workspace root never matches its own children.
 */
function canonicalize(target: string): string {
  let current = resolve(target);

  const unresolved: string[] = [];
  while (!existsSync(current)) {
    const parent = resolve(current, '..');
    if (parent === current) return resolve(target);
    unresolved.unshift(current.slice(parent.length + 1));
    current = parent;
  }

  try {
    return resolve(realpathSync(current), ...unresolved);
  } catch {
    return resolve(target);
  }
}
