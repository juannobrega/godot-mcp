import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { describeStructure, findProjects, readProjectName } from '../src/godot/scan.js';
import { silentLogger } from '../src/lib/log.js';

function makeProject(root: string, name?: string): string {
  mkdirSync(root, { recursive: true });
  const config = name ? `\n[application]\n\nconfig/name="${name}"\n` : '';
  writeFileSync(join(root, 'project.godot'), `config_version=5\n${config}`);
  return root;
}

const workspace = () => mkdtempSync(join(tmpdir(), 'godot-mcp-scan-'));

describe('readProjectName', () => {
  // This is the require('fs')-in-ESM bug: the configured name was never read.
  it('reads the configured project name', () => {
    const root = makeProject(join(workspace(), 'my-game'), 'Meu Jogo Bonito');
    expect(readProjectName(root)).toBe('Meu Jogo Bonito');
  });

  it('falls back to the directory name when no name is configured', () => {
    const root = makeProject(join(workspace(), 'untitled-game'));
    expect(readProjectName(root)).toBe('untitled-game');
  });

  it('falls back when there is no project file at all', () => {
    expect(readProjectName(join(workspace(), 'nothing-here'))).toBe('nothing-here');
  });
});

describe('findProjects', () => {
  it('finds the directory itself and its immediate children', () => {
    const root = workspace();
    makeProject(root, 'Root');
    makeProject(join(root, 'child'), 'Child');
    makeProject(join(root, 'deep', 'nested'), 'TooDeep');

    const found = findProjects(root, false, 8, silentLogger);
    expect(found.map((p) => p.name).sort()).toEqual(['Child', 'Root']);
  });

  it('finds nested projects when recursive', () => {
    const root = workspace();
    makeProject(join(root, 'a', 'b', 'game'), 'Nested');

    const found = findProjects(root, true, 8, silentLogger);
    expect(found.map((p) => p.name)).toEqual(['Nested']);
  });

  // A project's subfolders are assets, not more projects.
  it('does not descend into a project it already found', () => {
    const root = workspace();
    makeProject(root, 'Outer');
    makeProject(join(root, 'addons', 'inner'), 'Inner');

    const found = findProjects(root, true, 8, silentLogger);
    expect(found.map((p) => p.name)).toEqual(['Outer']);
  });

  // Without the realpath guard this never returns.
  it('terminates on a symlink cycle', () => {
    const root = workspace();
    mkdirSync(join(root, 'sub'), { recursive: true });
    symlinkSync(root, join(root, 'sub', 'loop'));
    makeProject(join(root, 'sub', 'game'), 'Loopy');

    const found = findProjects(root, true, 8, silentLogger);
    expect(found.map((p) => p.name)).toEqual(['Loopy']);
  });

  it('respects the depth limit', () => {
    const root = workspace();
    makeProject(join(root, 'a', 'b', 'c', 'd', 'game'), 'Deep');

    expect(findProjects(root, true, 2, silentLogger)).toEqual([]);
    expect(findProjects(root, true, 8, silentLogger).map((p) => p.name)).toEqual(['Deep']);
  });
});

describe('describeStructure', () => {
  it('counts files by kind', () => {
    const root = makeProject(join(workspace(), 'game'), 'Counted');
    mkdirSync(join(root, 'scenes'));
    mkdirSync(join(root, 'art'));
    writeFileSync(join(root, 'scenes', 'Main.tscn'), '');
    writeFileSync(join(root, 'scenes', 'Level.tscn'), '');
    writeFileSync(join(root, 'player.gd'), '');
    writeFileSync(join(root, 'art', 'hero.png'), '');

    const structure = describeStructure(root, 8, silentLogger);
    expect(structure.scenes).toBe(2);
    expect(structure.scripts).toBe(1);
    expect(structure.assets).toBe(1);
    // project.godot
    expect(structure.other).toBe(1);
  });

  it('terminates on a symlink cycle', () => {
    const root = makeProject(join(workspace(), 'game'), 'Loopy');
    mkdirSync(join(root, 'sub'));
    symlinkSync(root, join(root, 'sub', 'loop'));

    expect(() => describeStructure(root, 8, silentLogger)).not.toThrow();
  });
});
