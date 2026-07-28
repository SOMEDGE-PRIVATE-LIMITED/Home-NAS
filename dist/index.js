"use strict";
/**
 * DLNA Media Server — application entry point
 *
 * Wires all components and starts the server.
 *
 * Startup sequence:
 *   ConfigLoader → Logger → DeviceRegistry → MediaIndex → MediaLibrary
 *   → HTTP routes → HTTP server → initialScan → startWatching → SSDPServer
 *
 * Shutdown sequence (SIGTERM):
 *   1. Stop accepting new HTTP connections
 *   2. Drain active streams (max 10 s)
 *   3. SSDPServer.sendByebye()
 *   4. SSDPServer.stop()
 *   5. DeviceRegistry.persist()
 *   6. process.exit(0)
 *
 * Requirements: 9.4, 4.4, 8.4
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const os = __importStar(require("os"));
const ConfigLoader_js_1 = require("./config/ConfigLoader.js");
const logger_js_1 = require("./logger.js");
const DeviceRegistry_js_1 = require("./auth/DeviceRegistry.js");
const MediaIndex_js_1 = require("./media/MediaIndex.js");
const MediaScanner_js_1 = require("./media/MediaScanner.js");
const FilesystemWatcher_js_1 = require("./media/FilesystemWatcher.js");
const MediaLibrary_js_1 = require("./media/MediaLibrary.js");
const server_js_1 = require("./http/server.js");
const requestLogger_js_1 = require("./http/requestLogger.js");
const AuthMiddleware_js_1 = require("./auth/AuthMiddleware.js");
const PINHandler_js_1 = require("./auth/PINHandler.js");
const DeviceDescription_js_1 = require("./http/DeviceDescription.js");
const MediaStreamer_js_1 = require("./http/MediaStreamer.js");
const ContentDirectoryService_js_1 = require("./services/ContentDirectoryService.js");
const ConnectionManagerService_js_1 = require("./services/ConnectionManagerService.js");
const LibraryRefreshHandler_js_1 = require("./http/LibraryRefreshHandler.js");
const SSDPServer_js_1 = require("./ssdp/SSDPServer.js");
// ──────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ──────────────────────────────────────────────────────────────────────────────
async function main() {
    // 1. Load config — exits with code 1 on any error
    const config = (0, ConfigLoader_js_1.loadConfig)();
    // 2. Create structured logger
    const logger = (0, logger_js_1.createLogger)(config.logLevel);
    logger.info('DLNA Media Server starting…');
    // 3. Load device registry
    const deviceRegistry = new DeviceRegistry_js_1.DeviceRegistry({ logger });
    deviceRegistry.load();
    // 4. Build media index
    const mediaIndex = new MediaIndex_js_1.MediaIndex();
    // 5. Build base URL (used for resource URLs in DIDL-Lite and SSDP LOCATION)
    //    Determine the host address for the LOCATION header.  On Linux/macOS we
    //    pick the first non-loopback IPv4 address; fall back to 127.0.0.1.
    const host = getLocalIp();
    const baseUrl = `http://${host}:${config.port}`;
    // 6. Build media layer
    const scanner = new MediaScanner_js_1.MediaScanner(mediaIndex, logger, baseUrl, config.ffprobeConcurrency);
    const watcher = new FilesystemWatcher_js_1.FilesystemWatcher(scanner, mediaIndex, logger);
    const library = new MediaLibrary_js_1.MediaLibrary(config.mediaDirectories, scanner, watcher, mediaIndex, logger, config);
    // 7. Build Fastify HTTP server
    const fastify = (0, server_js_1.createHttpServer)();
    // 8. Register middleware and routes (order matters: logger → auth → routes)
    (0, requestLogger_js_1.registerRequestLogger)(fastify, logger);
    (0, AuthMiddleware_js_1.registerAuthMiddleware)(fastify, config, deviceRegistry);
    (0, PINHandler_js_1.registerPINHandler)(fastify, config, deviceRegistry, logger);
    (0, DeviceDescription_js_1.registerDeviceDescription)(fastify, config, baseUrl);
    (0, MediaStreamer_js_1.registerMediaStreamer)(fastify, mediaIndex, logger);
    (0, ContentDirectoryService_js_1.registerContentDirectoryService)(fastify, mediaIndex, logger, baseUrl);
    (0, ConnectionManagerService_js_1.registerConnectionManagerService)(fastify, logger);
    (0, LibraryRefreshHandler_js_1.registerLibraryRefreshHandler)(fastify, library, mediaIndex, logger);
    // 9. Track active stream count for graceful drain
    let activeStreams = 0;
    fastify.addHook('onRequest', (_req, _reply, done) => {
        activeStreams++;
        done();
    });
    fastify.addHook('onResponse', (_req, _reply, done) => {
        activeStreams = Math.max(0, activeStreams - 1);
        done();
    });
    // 10. Start HTTP server
    await (0, server_js_1.startHttpServer)(fastify, config.port);
    logger.info({ address: baseUrl }, 'HTTP server listening');
    // 11. Initial media scan then start watching
    await library.initialScan();
    library.startWatching();
    // 12. Build and start SSDP server
    const udn = (0, DeviceDescription_js_1.loadOrCreateUdn)();
    const ssdpServer = new SSDPServer_js_1.SSDPServer({
        port: 1900,
        location: `${baseUrl}/device.xml`,
        udn,
        serverName: config.friendlyName,
    }, logger);
    try {
        await ssdpServer.start();
    }
    catch (err) {
        logger.error({ err }, 'Failed to start SSDP server — check if port 1900 is already in use');
        process.exit(1);
    }
    logger.info({ port: config.port, friendlyName: config.friendlyName }, 'DLNA Media Server ready');
    // ── Graceful shutdown (SIGTERM) ───────────────────────────────────────────
    process.on('SIGTERM', () => {
        logger.info('SIGTERM received — shutting down gracefully');
        void (async () => {
            try {
                // Step 1: stop accepting new connections
                await (0, server_js_1.stopHttpServer)(fastify);
                // Step 2: drain active streams (max 10 s)
                if (activeStreams > 0) {
                    logger.info({ activeStreams }, 'Waiting for active streams to drain…');
                    await new Promise((resolve) => {
                        const deadline = setTimeout(resolve, 10_000);
                        const poll = setInterval(() => {
                            if (activeStreams <= 0) {
                                clearInterval(poll);
                                clearTimeout(deadline);
                                resolve();
                            }
                        }, 200);
                    });
                }
                // Step 3: send ssdp:byebye
                ssdpServer.sendByebye();
                // Step 4: close SSDP socket
                await ssdpServer.stop();
                // Step 5: persist device registry
                deviceRegistry.persist();
                logger.info('Shutdown complete');
            }
            catch (err) {
                logger.error({ err }, 'Error during shutdown');
            }
            finally {
                // Step 6: exit
                process.exit(0);
            }
        })();
    });
}
// ──────────────────────────────────────────────────────────────────────────────
// Helper — pick first non-loopback IPv4 address
// ──────────────────────────────────────────────────────────────────────────────
function getLocalIp() {
    const ifaces = os.networkInterfaces();
    for (const list of Object.values(ifaces)) {
        if (!list)
            continue;
        for (const iface of list) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}
// ──────────────────────────────────────────────────────────────────────────────
// Run
// ──────────────────────────────────────────────────────────────────────────────
main().catch((err) => {
    process.stderr.write(`[dlna-media-server] Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map