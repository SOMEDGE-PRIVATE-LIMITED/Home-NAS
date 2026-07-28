import type { FastifyInstance } from 'fastify';
import type { ServerConfig } from '../config/ConfigLoader.js';
/**
 * Loads the persistent UDN from disk. If not found, generates a new UUID v4,
 * writes it, and returns it.
 *
 * Requirements: 1.5
 */
export declare function loadOrCreateUdn(): string;
/**
 * Registers GET /device.xml, GET /cd/scpd.xml, GET /cm/scpd.xml.
 *
 * Requirements: 1.4, 1.5, 7.1, 7.2
 */
export declare function registerDeviceDescription(fastify: FastifyInstance, config: ServerConfig, baseUrl: string): void;
//# sourceMappingURL=DeviceDescription.d.ts.map