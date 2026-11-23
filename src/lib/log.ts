/**
 * Logging always goes to stderr.
 *
 * On the stdio transport, stdout carries the JSON-RPC stream: anything else
 * written there corrupts the protocol. Keeping every level on stderr means no
 * call site has to remember which stream is safe.
 */
export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(debugEnabled: boolean): Logger {
  const emit = (level: string, message: string) => console.error(`[${level}] ${message}`);

  return {
    debug: (message) => {
      if (debugEnabled) emit('DEBUG', message);
    },
    info: (message) => emit('INFO', message),
    warn: (message) => emit('WARN', message),
    error: (message) => emit('ERROR', message),
  };
}

/** Logger that discards everything, for tests. */
export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
