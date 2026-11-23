import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { ServerConfig } from '../config.js';
import type { Logger } from '../lib/log.js';
import { GODOT_SETUP_HINTS, ToolError } from '../lib/errors.js';
import { locateGodot } from './locate.js';

const execFileAsync = promisify(execFile);

export interface OperationResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Owns the Godot executable: where it is, what version it is, and how to run
 * operations through the bundled GDScript.
 *
 * Every invocation uses execFile with an argument array, never a shell string,
 * so no caller-supplied value is ever interpreted as a command.
 */
export class GodotBinary {
  private path: string | null = null;
  private versionCache: string | null = null;

  constructor(
    private readonly config: ServerConfig,
    private readonly logger: Logger,
    private readonly operationsScriptPath: string,
  ) {}

  /** Resolve the executable once, caching the result. */
  async resolvePath(): Promise<string> {
    if (this.path) return this.path;

    const located = await locateGodot({
      explicitPath: this.config.godotPath,
      logger: this.logger,
    });

    if (!located) {
      throw new ToolError('Could not find a usable Godot executable', GODOT_SETUP_HINTS);
    }

    this.path = located;
    return located;
  }

  /** Probe at startup so a misconfiguration surfaces before any tool call. */
  async verifyAvailable(): Promise<string> {
    const path = await this.resolvePath();
    this.logger.info(`Using Godot at: ${path}`);
    this.logger.info(`Godot version: ${await this.version()}`);
    return path;
  }

  async version(): Promise<string> {
    if (this.versionCache) return this.versionCache;

    const path = await this.resolvePath();
    const { stdout } = await execFileAsync(path, ['--version'], { timeout: 10_000 });
    this.versionCache = stdout.trim();
    return this.versionCache;
  }

  /** UIDs exist from Godot 4.4 onwards. */
  async supportsUids(): Promise<boolean> {
    return isGodot44OrLater(await this.version());
  }

  /**
   * Run Godot's asset import pass.
   *
   * Godot resolves textures, models and audio through its import system, which
   * normally only runs in the editor. A file just written into the project has
   * no .import sibling and cannot be loaded until this has seen it.
   */
  async runImport(projectPath: string): Promise<void> {
    const godotPath = await this.resolvePath();
    this.logger.debug(`Importing assets in ${projectPath}`);

    try {
      await execFileAsync(godotPath, ['--headless', '--path', projectPath, '--import'], {
        timeout: this.config.operationTimeoutMs,
        maxBuffer: this.config.operationMaxBuffer,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ToolError(`Godot could not import the project's assets: ${detail}`, [
        'Open the project in the editor once to complete the initial import',
        'Check that the project has no import errors',
      ]);
    }
  }

  /**
   * Run one operation through the bundled GDScript.
   *
   * Returns the real exit code so callers can tell failure from success. The
   * previous version swallowed the non-zero exit and returned it as a normal
   * result, leaving a fragile stderr substring match as the only error signal.
   */
  async runOperation(
    operation: string,
    params: Record<string, unknown>,
    projectPath: string,
  ): Promise<OperationResult> {
    const godotPath = await this.resolvePath();

    const args = [
      '--headless',
      '--path',
      projectPath,
      '--script',
      this.operationsScriptPath,
      operation,
      JSON.stringify(toGdScriptParams(params)),
    ];

    if (this.config.godotDebug) {
      args.push('--debug-godot');
    }

    this.logger.debug(`Running operation ${operation} in ${projectPath}`);
    this.logger.debug(`Params: ${JSON.stringify(toGdScriptParams(params))}`);

    try {
      const { stdout, stderr } = await execFileAsync(godotPath, args, {
        timeout: this.config.operationTimeoutMs,
        maxBuffer: this.config.operationMaxBuffer,
      });

      return { stdout: stdout ?? '', stderr: stderr ?? '', exitCode: 0 };
    } catch (error) {
      return this.interpretFailure(error, operation);
    }
  }

  /**
   * execFile rejects for three different reasons: a non-zero exit, a timeout,
   * and output past maxBuffer. Only the first carries a usable exit code; the
   * other two killed Godot mid-operation and must throw, so a truncated run is
   * never mistaken for a finished one.
   */
  private interpretFailure(error: unknown, operation: string): OperationResult {
    const failure = error as Error & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
      signal?: string;
    };

    if (failure?.killed || failure?.signal) {
      throw new ToolError(
        `Godot operation '${operation}' was killed before finishing — it exceeded ` +
          `the ${this.config.operationTimeoutMs}ms timeout or the output limit`,
        [
          'Retry with a smaller scope, or raise GODOT_MCP_TIMEOUT_MS',
          'Check whether the project opens without errors in the editor',
        ],
      );
    }

    if (typeof failure?.code === 'number') {
      return {
        stdout: failure.stdout ?? '',
        stderr: failure.stderr ?? '',
        exitCode: failure.code,
      };
    }

    throw error;
  }
}

/**
 * Decide whether a finished operation actually failed.
 *
 * The exit code is authoritative. The stderr check stays as a second signal
 * because a GDScript path can still report a failure and exit 0.
 */
export function operationFailed(result: OperationResult): boolean {
  return result.exitCode !== 0 || result.stderr.includes('Failed to');
}

/**
 * Convert top-level parameter keys to the snake_case vocabulary the bundled
 * GDScript reads (it looks up params.scene_path, params.root_node_type, ...).
 *
 * Shallow by design. The `properties` parameter of add_node holds Godot
 * property names and the caller's own game data; the previous implementation
 * recursed into it and silently renamed those keys.
 */
export function toGdScriptParams(params: Record<string, unknown>): Record<string, unknown> {
  const converted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    converted[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = value;
  }

  return converted;
}

export function isGodot44OrLater(version: string): boolean {
  const match = version.match(/^(\d+)\.(\d+)/);
  if (!match) return false;

  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  return major > 4 || (major === 4 && minor >= 4);
}
