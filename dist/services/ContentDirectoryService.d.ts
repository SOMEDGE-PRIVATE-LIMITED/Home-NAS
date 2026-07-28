import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { MediaIndex } from '../media/MediaIndex.js';
/**
 * Registers the `POST /cd/control` route that handles UPnP ContentDirectory
 * SOAP actions: `Browse` and `Search`.
 *
 * Requirements: 2.1–2.5, 2.9–2.12
 */
export declare function registerContentDirectoryService(fastify: FastifyInstance, index: MediaIndex, logger: Logger, baseUrl: string): void;
/**
 * Applies UPnP pagination to an ordered result set.
 *
 * - If `requestedCount` is 0, all items from `startingIndex` are returned.
 * - `numberReturned` = `min(requestedCount, max(0, total - startingIndex))`
 *   (or all remaining when requestedCount=0)
 *
 * Requirements: 2.5, 2.11
 */
export declare function paginate<T>(items: T[], startingIndex: number, requestedCount: number): {
    slice: T[];
    totalMatches: number;
    numberReturned: number;
};
//# sourceMappingURL=ContentDirectoryService.d.ts.map