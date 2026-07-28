import type { FastifyInstance } from 'fastify';
/**
 * Creates and configures a Fastify HTTP server instance.
 *
 * - Logger is disabled in Fastify itself; structured logging is handled via pino
 *   passed separately to service handlers.
 * - Registers content-type parsers for SOAP XML bodies (`text/xml` and
 *   `application/soap+xml`) so they are delivered as raw strings rather than
 *   being rejected by Fastify's default parser.
 *
 * Routes are registered externally by calling the appropriate register*
 * functions on the returned instance.
 *
 * Requirements: 5.5
 */
export declare function createHttpServer(): FastifyInstance;
/**
 * Starts the Fastify server, binding to all interfaces on the given port.
 *
 * Requirements: 5.5
 */
export declare function startHttpServer(fastify: FastifyInstance, port: number): Promise<void>;
/**
 * Stops the Fastify server, draining in-flight connections.
 *
 * Requirements: 5.5
 */
export declare function stopHttpServer(fastify: FastifyInstance): Promise<void>;
//# sourceMappingURL=server.d.ts.map