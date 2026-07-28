import type { FastifyInstance } from 'fastify';
import type { Logger } from '../logger.js';
/**
 * Registers HTTP request logging hooks on the Fastify instance.
 *
 * 1. `onResponse` hook: logs structured info for every HTTP response.
 * 2. `onSend` hook: for SOAP control routes, logs SOAP action details.
 *
 * Requirements: 8.2, 8.3
 */
export declare function registerRequestLogger(fastify: FastifyInstance, logger: Logger): void;
//# sourceMappingURL=requestLogger.d.ts.map