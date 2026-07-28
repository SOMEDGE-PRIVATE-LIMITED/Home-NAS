import type { FastifyInstance } from 'fastify';
import type { MediaLibrary } from '../media/MediaLibrary.js';
import type { MediaIndex } from '../media/MediaIndex.js';
import type { Logger } from '../logger.js';
/**
 * Registers the `POST /library/refresh` route.
 *
 * Triggers an immediate full re-scan of all configured media directories,
 * regardless of the configured `watchMode`.  This allows administrators to
 * manually refresh the library without restarting the server — particularly
 * useful in `"manual"` or `"interval"` watchMode where no continuous watcher
 * is running.
 *
 * Responses:
 * - 200 `{ itemCount: number }` — scan completed successfully
 * - 503 `{ error: "Scan already in progress" }` — a scan is already running
 *
 * The route is intentionally protected by `AuthMiddleware` (same as other
 * server-side routes) so that unauthenticated devices cannot trigger disk
 * activity.
 *
 * Requirements: 6.8
 */
export declare function registerLibraryRefreshHandler(fastify: FastifyInstance, mediaLibrary: MediaLibrary, mediaIndex: MediaIndex, logger: Logger): void;
//# sourceMappingURL=LibraryRefreshHandler.d.ts.map