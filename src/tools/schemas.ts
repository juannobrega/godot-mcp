import { z } from 'zod';

/**
 * A Godot class name, e.g. "Node2D" or "CharacterBody3D".
 *
 * Restricted to a bare identifier on purpose: anything path-shaped
 * ("res://evil.gd", "../x.gd") would let a caller instantiate an arbitrary
 * script through ClassDB/the global class registry.
 */
export const godotClassName = z
  .string()
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    'must be a bare Godot class name — no paths, slashes, colons or file extensions',
  );

export const projectPath = z
  .string()
  .min(1)
  .describe('Path to the Godot project directory (the one containing project.godot)');

export const scenePath = z
  .string()
  .min(1)
  .describe('Scene file path, relative to the project root, e.g. "scenes/Main.tscn"');

export const nodePath = z
  .string()
  .min(1)
  .describe('Node path within the scene, e.g. "root/Player/Sprite2D"');
