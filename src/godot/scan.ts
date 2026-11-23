import { existsSync, readdirSync, readFileSync, realpathSync, type Dirent } from 'node:fs';
import { basename, join } from 'node:path';

import type { Logger } from '../lib/log.js';

export interface FoundProject {
  path: string;
  name: string;
}

export interface ProjectStructure {
  scenes: number;
  scripts: number;
  assets: number;
  other: number;
}

const SCRIPT_EXTENSIONS = new Set(['gd', 'gdscript', 'cs']);
const ASSET_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'svg', 'ttf', 'otf',
  'wav', 'mp3', 'ogg', 'glb', 'gltf', 'obj', 'fbx',
]);

/**
 * Walk a directory tree, guarding against the two ways an unbounded walk goes
 * wrong: unlimited depth, and symlink cycles. Both used to hang `list_projects`
 * when pointed at a home directory.
 */
function walk(
  root: string,
  maxDepth: number,
  logger: Logger,
  visit: (dir: string, entries: Dirent[]) => 'descend' | 'stop',
): void {
  const visited = new Set<string>();

  const step = (dir: string, depth: number): void => {
    if (depth > maxDepth) {
      logger.debug(`Max scan depth reached at ${dir}, not descending`);
      return;
    }

    // Canonicalize before descending so a symlink cycle cannot loop forever
    let canonical: string;
    try {
      canonical = realpathSync(dir);
    } catch (error) {
      logger.debug(`Cannot resolve ${dir}: ${error}`);
      return;
    }

    if (visited.has(canonical)) return;
    visited.add(canonical);

    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      logger.debug(`Cannot read ${dir}: ${error}`);
      return;
    }

    if (visit(dir, entries) === 'stop') return;

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      step(join(dir, entry.name), depth + 1);
    }
  };

  step(root, 0);
}

/** A directory is a Godot project when it holds a project.godot file. */
export function isGodotProject(directory: string): boolean {
  return existsSync(join(directory, 'project.godot'));
}

/**
 * Find Godot projects at or under a directory.
 *
 * Non-recursive means the directory itself plus its immediate children, which
 * is what makes `list_projects` useful on a folder full of projects.
 */
export function findProjects(
  directory: string,
  recursive: boolean,
  maxDepth: number,
  logger: Logger,
): FoundProject[] {
  const projects: FoundProject[] = [];
  const record = (path: string) => projects.push({ path, name: readProjectName(path) });

  if (!recursive) {
    if (isGodotProject(directory)) record(directory);

    try {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const child = join(directory, entry.name);
        if (isGodotProject(child)) record(child);
      }
    } catch (error) {
      logger.debug(`Cannot read ${directory}: ${error}`);
    }

    return projects;
  }

  walk(directory, maxDepth, logger, (dir) => {
    if (!isGodotProject(dir)) return 'descend';
    record(dir);
    // Do not descend into a project: its subfolders are assets, not projects
    return 'stop';
  });

  return projects;
}

/** Count files by kind across a project. */
export function describeStructure(
  projectPath: string,
  maxDepth: number,
  logger: Logger,
): ProjectStructure {
  const structure: ProjectStructure = { scenes: 0, scripts: 0, assets: 0, other: 0 };

  walk(projectPath, maxDepth, logger, (_dir, entries) => {
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith('.')) continue;

      const extension = entry.name.split('.').pop()?.toLowerCase() ?? '';
      if (extension === 'tscn' || extension === 'scn') structure.scenes++;
      else if (SCRIPT_EXTENSIONS.has(extension)) structure.scripts++;
      else if (ASSET_EXTENSIONS.has(extension)) structure.assets++;
      else structure.other++;
    }
    return 'descend';
  });

  return structure;
}

/**
 * The project's configured name, falling back to its directory name.
 *
 * This used to call require('fs') inside an ESM module, which threw
 * "require is not defined" into a silent catch — so the configured name was
 * never read and every project was reported by its folder name.
 */
export function readProjectName(projectPath: string): string {
  try {
    const contents = readFileSync(join(projectPath, 'project.godot'), 'utf8');
    const match = contents.match(/config\/name\s*=\s*"([^"]*)"/);
    if (match?.[1]) return match[1];
  } catch {
    // Fall through to the directory name
  }

  return basename(projectPath);
}
