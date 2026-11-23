import { spawn, type ChildProcess } from 'node:child_process';

import type { Logger } from '../lib/log.js';
import { ToolError } from '../lib/errors.js';

/**
 * A bounded line buffer.
 *
 * The previous implementation pushed every line into an array that was never
 * trimmed, so a chatty project grew the server's memory for as long as it ran.
 */
class LineBuffer {
  private lines: string[] = [];
  private dropped = 0;

  constructor(private readonly limit: number) {}

  append(chunk: string): string[] {
    const incoming = chunk.split('\n').filter((line) => line.length > 0);
    this.lines.push(...incoming);

    if (this.lines.length > this.limit) {
      const excess = this.lines.length - this.limit;
      this.lines.splice(0, excess);
      this.dropped += excess;
    }

    return incoming;
  }

  snapshot(): string[] {
    if (this.dropped === 0) return [...this.lines];
    return [`[... ${this.dropped} earlier lines dropped ...]`, ...this.lines];
  }
}

export interface RunningProject {
  readonly projectPath: string;
  readonly scene?: string;
  output(): string[];
  errors(): string[];
  exitCode: number | null;
}

interface Tracked extends RunningProject {
  child: ChildProcess;
}

/**
 * Tracks the single project run that `run_project` starts.
 *
 * One at a time matches the tool surface: run_project, get_debug_output and
 * stop_project all address "the" running project with no handle.
 */
export class ProjectRunner {
  private current: Tracked | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly maxOutputLines: number,
  ) {}

  isRunning(): boolean {
    return this.current !== null;
  }

  start(godotPath: string, projectPath: string, scene?: string): RunningProject {
    // Replacing a run is the documented behaviour, but stop the old one first
    if (this.current) {
      this.logger.debug('Replacing the running project');
      this.stopChild(this.current);
    }

    const args = ['-d', '--path', projectPath];
    if (scene) args.push(scene);

    this.logger.debug(`Starting project: ${godotPath} ${args.join(' ')}`);
    const child = spawn(godotPath, args, { stdio: 'pipe' });

    const stdout = new LineBuffer(this.maxOutputLines);
    const stderr = new LineBuffer(this.maxOutputLines);

    const tracked: Tracked = {
      child,
      projectPath,
      scene,
      exitCode: null,
      output: () => stdout.snapshot(),
      errors: () => stderr.snapshot(),
    };

    child.stdout?.on('data', (data: Buffer) => {
      for (const line of stdout.append(data.toString())) {
        if (line.trim()) this.logger.debug(`[godot stdout] ${line}`);
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      for (const line of stderr.append(data.toString())) {
        if (line.trim()) this.logger.debug(`[godot stderr] ${line}`);
      }
    });

    child.on('exit', (code) => {
      this.logger.debug(`Godot project exited with code ${code}`);
      tracked.exitCode = code;
      // Only clear if this run is still the current one
      if (this.current === tracked) this.current = null;
    });

    child.on('error', (error) => {
      this.logger.error(`Failed to start Godot project: ${error.message}`);
      if (this.current === tracked) this.current = null;
    });

    this.current = tracked;
    return tracked;
  }

  /** The active run, or a ToolError explaining that there is none. */
  require(): RunningProject {
    if (!this.current) {
      throw new ToolError('No Godot project is running', [
        'Use run_project to start one first',
        'The project may have exited on its own — check get_debug_output before stopping',
      ]);
    }
    return this.current;
  }

  stop(): { output: string[]; errors: string[] } {
    const tracked = this.current;
    if (!tracked) {
      throw new ToolError('No Godot project is running to stop', [
        'Use run_project to start one first',
      ]);
    }

    const snapshot = { output: tracked.output(), errors: tracked.errors() };
    this.stopChild(tracked);
    this.current = null;
    return snapshot;
  }

  /** Terminate every tracked child, for shutdown. */
  dispose(): void {
    if (this.current) {
      this.stopChild(this.current);
      this.current = null;
    }
  }

  /**
   * Ask the child to exit, then make sure it does. SIGTERM alone can leave a
   * wedged engine process alive and holding the project directory.
   */
  private stopChild(tracked: Tracked): void {
    const { child } = tracked;
    if (child.exitCode !== null || child.signalCode !== null) return;

    child.kill('SIGTERM');

    const escalation = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        this.logger.warn('Godot did not exit on SIGTERM, sending SIGKILL');
        child.kill('SIGKILL');
      }
    }, 5_000);

    // Do not hold the event loop open just to escalate a kill
    escalation.unref?.();
    child.once('exit', () => clearTimeout(escalation));
  }
}
