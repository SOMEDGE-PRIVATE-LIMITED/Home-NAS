import type { FastifyInstance } from 'fastify';
import type { Logger } from '../logger.js';
import type { MediaIndex } from '../media/MediaIndex.js';
/**
 * Registers GET and HEAD routes for `/stream/:itemId`.
 * Serves media files with byte-range support and DLNA headers.
 *
 * Design section 2.7
 * Requirements: 4.1, 4.2, 4.3, 4.5, 7.3
 */
export declare function registerMediaStreamer(fastify: FastifyInstance, index: MediaIndex, logger: Logger): void;
//# sourceMappingURL=MediaStreamer.d.ts.map