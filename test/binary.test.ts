import { describe, expect, it } from 'vitest';

import { isGodot44OrLater, operationFailed, toGdScriptParams } from '../src/godot/binary.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { candidatePaths, probeGodotPathForReason } from '../src/godot/locate.js';
import { silentLogger } from '../src/lib/log.js';

describe('toGdScriptParams', () => {
  it('converts top-level keys to the GDScript vocabulary', () => {
    expect(toGdScriptParams({ scenePath: 'a.tscn', rootNodeType: 'Node2D' })).toEqual({
      scene_path: 'a.tscn',
      root_node_type: 'Node2D',
    });
  });

  // The GDScript iterates `properties` as caller data; renaming its keys
  // would corrupt the values written into the scene.
  it('leaves nested objects completely untouched', () => {
    const properties = { rotation_degrees: 90, customData: { innerKey: 1 } };
    const out = toGdScriptParams({ nodeName: 'S', properties });
    expect(out).toEqual({ node_name: 'S', properties });
    expect(out.properties).toBe(properties);
  });

  it('passes arrays through as values', () => {
    expect(toGdScriptParams({ meshItemNames: ['a', 'b'] })).toEqual({ mesh_item_names: ['a', 'b'] });
  });
});

describe('operationFailed', () => {
  it('trusts a non-zero exit code', () => {
    expect(operationFailed({ stdout: 'all good', stderr: '', exitCode: 1 })).toBe(true);
  });

  it('accepts a clean run', () => {
    expect(operationFailed({ stdout: 'done', stderr: '', exitCode: 0 })).toBe(false);
  });

  // Kept as a second signal: a GDScript path can report failure and exit 0.
  it('still catches a stderr failure that exited zero', () => {
    expect(operationFailed({ stdout: '', stderr: 'Failed to save scene', exitCode: 0 })).toBe(true);
  });

  it('does not treat ordinary stderr noise as failure', () => {
    expect(operationFailed({ stdout: '', stderr: 'Godot Engine v4.7.2', exitCode: 0 })).toBe(false);
  });
});

describe('isGodot44OrLater', () => {
  it.each([
    ['4.4.stable', true],
    ['4.4.1.stable.official', true],
    ['4.7.2.stable.official.ed1daf0bf', true],
    ['5.0.beta1', true],
    ['4.3.stable', false],
    ['4.0.alpha', false],
    ['3.5.2.stable', false],
    ['not a version', false],
  ])('%s -> %s', (version, expected) => {
    expect(isGodot44OrLater(version)).toBe(expected);
  });
});

describe('candidatePaths', () => {
  it('always probes PATH first', () => {
    expect(candidatePaths('linux', {})[0]).toBe('godot');
  });

  it('offers platform-appropriate locations', () => {
    expect(candidatePaths('darwin', {}).some((p) => p.includes('Godot.app'))).toBe(true);
    expect(candidatePaths('win32', {}).some((p) => p.endsWith('Godot.exe'))).toBe(true);
    expect(candidatePaths('linux', {})).toContain('/usr/bin/godot');
  });
});

describe('probeGodotPathForReason', () => {
  // The reason is what turns "not usable" into something fixable. These are
  // the three failures that actually happen in a container.
  it('reports a missing file', () => {
    expect(probeGodotPathForReason('/nonexistent/godot', silentLogger)).toBe('file does not exist');
  });

  it('reports a binary that is not executable as such', () => {
    const notAnEngine = join(mkdtempSync(join(tmpdir(), 'godot-mcp-probe-')), 'godot');
    writeFileSync(notAnEngine, 'not a binary at all\n', { mode: 0o755 });

    const reason = probeGodotPathForReason(notAnEngine, silentLogger);
    expect(reason).not.toBeNull();
    expect(reason).not.toBe('file does not exist');
  });

  it('reports a file without the execute bit', () => {
    const unexecutable = join(mkdtempSync(join(tmpdir(), 'godot-mcp-probe-')), 'godot');
    writeFileSync(unexecutable, 'x', { mode: 0o644 });

    expect(probeGodotPathForReason(unexecutable, silentLogger)).toContain('permission denied');
  });

  it('returns null for a binary that answers --version', () => {
    // /bin/echo exits zero for any argument, which is all the probe requires
    expect(probeGodotPathForReason('/bin/echo', silentLogger)).toBeNull();
  });
});
