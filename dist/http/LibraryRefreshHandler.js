"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLibraryRefreshHandler = registerLibraryRefreshHandler;
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
function registerLibraryRefreshHandler(fastify, mediaLibrary, mediaIndex, logger) {
    fastify.post('/library/refresh', async (request, reply) => {
        logger.info({ remoteAddress: request.socket.remoteAddress }, 'LibraryRefreshHandler: manual refresh requested');
        const started = await mediaLibrary.refresh();
        if (!started) {
            return reply.status(503).send({ error: 'Scan already in progress' });
        }
        const itemCount = mediaIndex.getAllItems().length;
        logger.info({ itemCount }, 'LibraryRefreshHandler: refresh complete');
        return reply.status(200).send({ itemCount });
    });
}
//# sourceMappingURL=LibraryRefreshHandler.js.map