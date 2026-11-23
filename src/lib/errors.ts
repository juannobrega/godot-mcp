import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * A failure the model should see as tool output rather than as a protocol
 * error, so it can act on it. `solutions` carries the remediation hints that
 * used to be copy-pasted into every handler.
 */
export class ToolError extends Error {
  readonly solutions: string[];

  constructor(message: string, solutions: string[] = []) {
    super(message);
    this.name = 'ToolError';
    this.solutions = solutions;
  }
}

/** Hints worth repeating whenever the Godot binary itself is in question. */
export const GODOT_SETUP_HINTS = [
  'Ensure Godot is installed correctly',
  'Set GODOT_PATH to the Godot executable',
];

export function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

export function jsonResult(value: unknown): CallToolResult {
  return textResult(JSON.stringify(value, null, 2));
}

export function errorResult(message: string, solutions: string[] = []): CallToolResult {
  const content: CallToolResult['content'] = [{ type: 'text', text: message }];

  if (solutions.length > 0) {
    content.push({ type: 'text', text: `Possible solutions:\n- ${solutions.join('\n- ')}` });
  }

  return { content, isError: true };
}

/**
 * Turn anything thrown inside a tool into a tool result. A ToolError carries
 * its own hints; anything else is unexpected and reported as-is rather than
 * being dressed up with guesses about the cause.
 */
export function toErrorResult(error: unknown, context: string): CallToolResult {
  if (error instanceof ToolError) {
    return errorResult(`${context}: ${error.message}`, error.solutions);
  }

  const message = error instanceof Error ? error.message : String(error);
  return errorResult(`${context}: ${message}`);
}
