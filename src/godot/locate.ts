import { existsSync } from 'node:fs';
import { normalize } from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
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
  return probeGodotPathForReason(path, logger) === null;
}

/**
 * Probe a candidate, returning why it is unusable, or null when it works.
 *
 * The reason matters for an explicitly configured path: "not usable" alone
 * leaves no way to tell a missing file from a wrong architecture from a
 * missing shared library, which is the difference between a one-line fix and
 * an afternoon.
 */
export function probeGodotPathForReason(path: string, logger: Logger): string | null {
  // "godot" may resolve via PATH, so skip the existence check for it
  if (path !== 'godot' && !existsSync(path)) {
    logger.debug(`Godot candidate does not exist: ${path}`);
    return 'file does not exist';
  }

  try {
    execFileSync(path, ['--version'], { timeout: PROBE_TIMEOUT_MS, stdio: 'pipe' });
    logger.debug(`Godot candidate is valid: ${path}`);
    return null;
  } catch (error) {
    const reason = describeProbeFailure(error);
    logger.debug(`Godot candidate failed to run: ${path} (${reason})`);
    return reason;
  }
}

/**
 * Turn an exec failure into something actionable.
 *
 * ENOEXEC and "cannot execute binary file" mean the binary was built for a
 * different architecture, which is what a container image assembled on the
 * wrong platform looks like. A missing shared library surfaces on stderr.
 */
function describeProbeFailure(error: unknown): string {
  const failure = error as Error & { code?: string | number; stderr?: Buffer | string };
  const stderr = failure?.stderr ? failure.stderr.toString().trim() : '';

  if (failure?.code === 'ENOEXEC' || /cannot execute binary file|Exec format error/i.test(stderr)) {
    return `wrong architecture for this machine — the binary cannot be executed here (${stderr || 'ENOEXEC'})`;
  }

  if (/error while loading shared libraries|No such file or directory/i.test(stderr)) {
    return `a required shared library is missing: ${stderr}`;
  }

  if (failure?.code === 'EACCES') {
    return 'not executable (permission denied)';
  }

  return stderr || failure?.message || String(error);
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
    const reason = probeGodotPathForReason(normalized, logger);
    if (reason === null) return normalized;

    // An explicitly configured path that fails is a misconfiguration, not a
    // candidate that happened to miss, so say exactly what went wrong.
    logger.warn(`Configured Godot path ${normalized} is not usable: ${reason}`);
  }

  for (const candidate of candidatePaths(platform, env)) {
    const normalized = normalize(candidate);
    if (await probeGodotPath(normalized, logger)) return normalized;
  }

  return null;
}
