import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { ServerConfig } from '../config/ConfigLoader.js';
import type { DeviceRegistry } from './DeviceRegistry.js';

/**
 * Strips the IPv4-mapped IPv6 prefix from an address string.
 *
 * Node.js reports IPv4 clients on a dual-stack socket as `::ffff:192.168.1.1`.
 * Stripping the prefix ensures comparisons against plain IPv4 strings work.
 */
function normaliseIp(address: string): string {
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

/**
 * Registers a Fastify `onRequest` hook that enforces PIN authentication on all
 * routes except `POST /pin` and `GET /device.xml`.
 *
 * Auth logic (in order):
 *  1. Skip if the request URL is `/pin` or `/device.xml`.
 *  2. If `config.pin` is empty → always pass through (no auth configured).
 *  3. If the normalised client IP is in `registry.registeredIps` → pass through.
 *  4. Otherwise → reply 401 with `WWW-Authenticate: PIN`.
 *
 * Requirements: 10.1, 10.4, 10.6
 */
export function registerAuthMiddleware(
  fastify: FastifyInstance,
  config: ServerConfig,
  registry: DeviceRegistry
): void {
  fastify.addHook(
    'onRequest',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const url = request.url;

      // Public routes — skip auth entirely
      if (url === '/pin' || url.startsWith('/pin?') || url === '/device.xml') {
        return;
      }

      // No PIN configured — always allow
      if (config.pin === '') {
        return;
      }

      // IP already registered — allow
      const rawIp = request.socket.remoteAddress ?? '';
      const ip = normaliseIp(rawIp);

      if (registry.isRegistered(ip)) {
        return;
      }

      // Unregistered device — reject with 401
      await reply
        .status(401)
        .header('WWW-Authenticate', 'PIN')
        .send({ error: 'Unauthorized' });
    }
  );
}
