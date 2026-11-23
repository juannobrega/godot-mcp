import { existsSync } from 'node:fs';
import { normalize } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { Logger } from '../lib/log.js';

const execFileAsync = promisify(execFile);

/** Timeout for the `--version` probe used to validate a candidate path. */
const PROBE_TIMEOUT_MS = 10_000;

/**
 * Candidate Godot locations for a platform, most specific last.
 * "godot" comes first so a PATH install wins over a bundled app.
 */
export function candidatePaths(platform: string, env: NodeJS.ProcessEnv): string[] {
  const candidates = ['godot'];

  if (platform === 'darwin') {
    candidates.push(
      '/Applications/Godot.app/Contents/MacOS/Godot',
      '/Applications/Godot_4.app/Contents/MacOS/Godot',
      `${env.HOME}/Applications/Godot.app/Contents/MacOS/Godot`,
      `${env.HOME}/Applications/Godot_4.app/Contents/MacOS/Godot`,
      `${env.HOME}/Library/Application Support/Steam/steamapps/common/Godot Engine/Godot.app/Contents/MacOS/Godot`,
    );
  } else if (platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Godot\\Godot.exe',
      'C:\\Program Files (x86)\\Godot\\Godot.exe',
      'C:\\Program Files\\Godot_4\\Godot.exe',
      'C:\\Program Files (x86)\\Godot_4\\Godot.exe',
      `${env.USERPROFILE}\\Godot\\Godot.exe`,
    );
  } else {
    candidates.push(
      '/usr/bin/godot',
      '/usr/local/bin/godot',
      '/snap/bin/godot',
      `${env.HOME}/.local/bin/godot`,
    );
  }

  return candidates;
}

/**
 * Probe a candidate by actually running it. Existence is not enough: the path
 * may be a stale symlink or a file that is not the engine at all.
 */
export async function probeGodotPath(path: string, logger: Logger): Promise<boolean> {
  // "godot" may resolve via PATH, so skip the existence check for it
  if (path !== 'godot' && !existsSync(path)) {
    logger.debug(`Godot candidate does not exist: ${path}`);
    return false;
  }

  try {
    await execFileAsync(path, ['--version'], { timeout: PROBE_TIMEOUT_MS });
    logger.debug(`Godot candidate is valid: ${path}`);
    return true;
  } catch (error) {
    logger.debug(`Godot candidate failed to run: ${path} (${error})`);
    return false;
  }
}

export interface LocateOptions {
  explicitPath?: string;
  platform?: string;
  env?: NodeJS.ProcessEnv;
  logger: Logger;
}

/**
 * Find a usable Godot executable, or return null.
 *
 * Returning null rather than guessing a default is deliberate: the previous
 * fallback produced a path that merely looked plausible, turning a clear
 * startup failure into a confusing error on every later tool call.
 */
export async function locateGodot(options: LocateOptions): Promise<string | null> {
  const { explicitPath, logger } = options;
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;

  if (explicitPath) {
    const normalized = normalize(explicitPath);
    if (await probeGodotPath(normalized, logger)) return normalized;
    logger.warn(`Configured Godot path is not usable: ${normalized}`);
  }

  for (const candidate of candidatePaths(platform, env)) {
    const normalized = normalize(candidate);
    if (await probeGodotPath(normalized, logger)) return normalized;
  }

  return null;
}
