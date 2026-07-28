import pino from 'pino';
import type { Logger } from 'pino';

import type { ServerConfig } from './config/ConfigLoader.js';

// Re-export the Logger type so consumers can type their logger references
export type { Logger };

// Map uppercase config log levels to the lowercase names pino expects
const levelMap: Record<ServerConfig['logLevel'], pino.Level> = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
};

/**
 * Creates a pino logger configured with:
 * - ISO timestamps (pino.stdTimeFunctions.isoTime)
 * - Structured JSON output written to stdout (fd 1)
 * - Log level mapped from the ServerConfig uppercase convention to pino's lowercase convention
 *
 * Requirements: 8.1, 8.5
 */
export function createLogger(level: ServerConfig['logLevel']): Logger {
  return pino(
    {
      level: levelMap[level],
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.destination(1) // stdout
  );
}
