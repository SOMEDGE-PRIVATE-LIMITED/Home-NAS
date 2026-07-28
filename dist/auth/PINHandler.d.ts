import type { FastifyInstance } from 'fastify';
import type { ServerConfig } from '../config/ConfigLoader.js';
import type { Logger } from '../logger.js';
import type { DeviceRegistry } from './DeviceRegistry.js';
/**
 * Registers the `POST /pin` route on the Fastify instance.
 *
 * Request body: `{ "pin": "<string>" }`
 *
 * Success (PIN matches config):
 *  - Registers the client's IP via `DeviceRegistry.registerDevice`
 *  - Returns HTTP 200 `{ "status": "ok" }`
 *
 * Failure (wrong PIN):
 *  - Logs a warning with the client IP
 *  - Returns HTTP 403 `{ "error": "Forbidden" }`
 *
 * Requirements: 10.2
 */
export declare function registerPINHandler(fastify: FastifyInstance, config: ServerConfig, registry: DeviceRegistry, logger: Logger): void;
//# sourceMappingURL=PINHandler.d.ts.map