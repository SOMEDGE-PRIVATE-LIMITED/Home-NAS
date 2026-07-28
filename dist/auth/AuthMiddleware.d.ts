import type { FastifyInstance } from 'fastify';
import type { ServerConfig } from '../config/ConfigLoader.js';
import type { DeviceRegistry } from './DeviceRegistry.js';
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
export declare function registerAuthMiddleware(fastify: FastifyInstance, config: ServerConfig, registry: DeviceRegistry): void;
//# sourceMappingURL=AuthMiddleware.d.ts.map