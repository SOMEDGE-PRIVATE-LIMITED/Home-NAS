import type { Logger } from 'pino';
import type { ServerConfig } from './config/ConfigLoader.js';
export type { Logger };
/**
 * Creates a pino logger configured with:
 * - ISO timestamps (pino.stdTimeFunctions.isoTime)
 * - Structured JSON output written to stdout (fd 1)
 * - Log level mapped from the ServerConfig uppercase convention to pino's lowercase convention
 *
 * Requirements: 8.1, 8.5
 */
export declare function createLogger(level: ServerConfig['logLevel']): Logger;
//# sourceMappingURL=logger.d.ts.map