/**
 * Single source of truth for the advertised version.
 *
 * Kept as a literal rather than read from package.json: the compiled output
 * ships without it, and a test asserts the two stay in step.
 */
export const SERVER_VERSION = '1.2.1';
