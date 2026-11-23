import { mkdtempSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { assertProjectRelativePath, resolveProjectPath } from '../src/lib/paths.js';
import { ToolError } from '../src/lib/errors.js';

describe('assertProjectRelativePath', () => {
  it('accepts a plain project-relative path', () => {
    expect(assertProjectRelativePath('scenes/Main.tscn', 'scenePath')).toBe('scenes/Main.tscn');
  });

  it('strips a res:// prefix', () => {
    expect(assertProjectRelativePath('res://scenes/Main.tscn', 'scenePath')).toBe('scenes/Main.tscn');
  });

  it('collapses interior traversal that stays inside the project', () => {
    expect(assertProjectRelativePath('scenes/../assets/x.png', 'texturePath')).toBe('assets/x.png');
  });

  // The old substring check rejected this, which is a false positive: a file
  // may legitimately have two dots in its name.
  it('accepts a filename containing ".."', () => {
    expect(assertProjectRelativePath('my..scene.tscn', 'scenePath')).toBe('my..scene.tscn');
  });

  it('rejects traversal that escapes the project', () => {
    expect(() => assertProjectRelativePath('../../etc/passwd', 'scenePath')).toThrow(ToolError);
    expect(() => assertProjectRelativePath('scenes/../../outside.tscn', 'scenePath')).toThrow(ToolError);
  });

  it('rejects absolute paths', () => {
    expect(() => assertProjectRelativePath('/etc/passwd', 'scenePath')).toThrow(ToolError);
    expect(() => assertProjectRelativePath('C:\\Windows\\win.ini', 'scenePath')).toThrow(ToolError);
  });

  it('rejects empty input', () => {
    expect(() => assertProjectRelativePath('', 'scenePath')).toThrow(ToolError);
    expect(() => assertProjectRelativePath('   ', 'scenePath')).toThrow(ToolError);
  });
});

describe('resolveProjectPath', () => {
  it('resolves against the process cwd when unconfined', () => {
    expect(resolveProjectPath('/tmp/some/project')).toBe(resolve('/tmp/some/project'));
  });

  it('resolves a relative path against the workspace root', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'godot-mcp-ws-'));
    mkdirSync(join(workspace, 'game'));
    expect(resolveProjectPath('game', workspace)).toBe(join(workspace, 'game'));
  });

  it('rejects a path outside the workspace', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'godot-mcp-ws-'));
    expect(() => resolveProjectPath('../escape', workspace)).toThrow(ToolError);
    expect(() => resolveProjectPath('/etc', workspace)).toThrow(ToolError);
  });

  // Containment has to survive symlinks, or it is decorative.
  it('rejects a symlink pointing out of the workspace', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'godot-mcp-ws-'));
    const outside = mkdtempSync(join(tmpdir(), 'godot-mcp-out-'));
    symlinkSync(outside, join(workspace, 'escape-link'));

    expect(() => resolveProjectPath('escape-link', workspace)).toThrow(ToolError);
  });

  it('accepts a path that does not exist yet inside the workspace', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'godot-mcp-ws-'));
    expect(resolveProjectPath('not/created/yet', workspace)).toBe(join(workspace, 'not/created/yet'));
  });
});
