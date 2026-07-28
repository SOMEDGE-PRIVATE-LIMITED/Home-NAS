import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
/**
 * Registers the `POST /cm/control` route that handles UPnP ConnectionManager
 * SOAP actions. Currently only `GetProtocolInfo` is supported.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
export declare function registerConnectionManagerService(fastify: FastifyInstance, logger: Logger): void;
//# sourceMappingURL=ConnectionManagerService.d.ts.map