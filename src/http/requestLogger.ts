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
export function registerRequestLogger(
  fastify: FastifyInstance,
  logger: Logger
): void {
  // Log every HTTP request/response
  fastify.addHook('onResponse', (request, reply, done) => {
    logger.info({
      method: request.method,
      url: request.url,
      remoteAddress: request.socket.remoteAddress ?? 'unknown',
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
    });
    done();
  });

  // Log SOAP action details for control routes
  fastify.addHook('onSend', (request, reply, _payload, done) => {
    const url = request.url;

    if (url === '/cd/control' || url === '/cm/control') {
      const rawSoapAction = request.headers['soapaction'] as string | undefined;
      const soapAction = rawSoapAction
        ? rawSoapAction.replace(/^"(.*)"$/, '$1')
        : undefined;

      const serviceType: string = url.startsWith('/cd/')
        ? 'ContentDirectory'
        : 'ConnectionManager';

      logger.debug({
        soapAction,
        serviceType,
        responseStatus: reply.statusCode,
      });
    }

    done(null, _payload);
  });
}
