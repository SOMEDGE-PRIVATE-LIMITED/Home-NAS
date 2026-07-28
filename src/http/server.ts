import Fastify from 'fastify';
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
export function createHttpServer(): FastifyInstance {
  const fastify = Fastify({ logger: false });

  // Register SOAP content-type parsers — deliver body as raw string
  fastify.addContentTypeParser(
    'text/xml',
    { parseAs: 'string' },
    (_req, body, done) => done(null, body)
  );
  fastify.addContentTypeParser(
    'application/soap+xml',
    { parseAs: 'string' },
    (_req, body, done) => done(null, body)
  );

  return fastify;
}

/**
 * Starts the Fastify server, binding to all interfaces on the given port.
 *
 * Requirements: 5.5
 */
export async function startHttpServer(
  fastify: FastifyInstance,
  port: number
): Promise<void> {
  await fastify.listen({ port, host: '0.0.0.0' });
}

/**
 * Stops the Fastify server, draining in-flight connections.
 *
 * Requirements: 5.5
 */
export async function stopHttpServer(fastify: FastifyInstance): Promise<void> {
  await fastify.close();
}
