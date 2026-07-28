import type { FastifyInstance } from 'fastify';

import type { ServerConfig } from '../config/ConfigLoader.js';
import type { Logger } from '../logger.js';
import type { DeviceRegistry } from './DeviceRegistry.js';

/**
 * Strips the IPv4-mapped IPv6 prefix from an address string.
 *
 * Shared normalisation logic — mirrors AuthMiddleware behaviour.
 */
function normaliseIp(address: string): string {
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

/** Expected shape of the POST /pin request body. */
interface PinBody {
  pin: string;
}

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
export function registerPINHandler(
  fastify: FastifyInstance,
  config: ServerConfig,
  registry: DeviceRegistry,
  logger: Logger
): void {
  fastify.post<{ Body: PinBody }>(
    '/pin',
    {
      schema: {
        body: {
          type: 'object',
          required: ['pin'],
          properties: {
            pin: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const rawIp = request.socket.remoteAddress ?? '';
      const ip = normaliseIp(rawIp);
      const { pin } = request.body;

      if (pin === config.pin) {
        registry.registerDevice(ip);
        return reply.status(200).send({ status: 'ok' });
      }

      logger.warn({ ip }, 'PINHandler: failed PIN attempt');
      return reply.status(403).send({ error: 'Forbidden' });
    }
  );
}
