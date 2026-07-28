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

import * as os from 'os';
import { loadConfig } from './config/ConfigLoader.js';
import { createLogger } from './logger.js';
import { DeviceRegistry } from './auth/DeviceRegistry.js';
import { MediaIndex } from './media/MediaIndex.js';
import { MediaScanner } from './media/MediaScanner.js';
import { FilesystemWatcher } from './media/FilesystemWatcher.js';
import { MediaLibrary } from './media/MediaLibrary.js';
import { createHttpServer, startHttpServer, stopHttpServer } from './http/server.js';
import { registerRequestLogger } from './http/requestLogger.js';
import { registerAuthMiddleware } from './auth/AuthMiddleware.js';
import { registerPINHandler } from './auth/PINHandler.js';
import { registerDeviceDescription, loadOrCreateUdn } from './http/DeviceDescription.js';
import { registerMediaStreamer } from './http/MediaStreamer.js';
import { registerContentDirectoryService } from './services/ContentDirectoryService.js';
import { registerConnectionManagerService } from './services/ConnectionManagerService.js';
import { registerLibraryRefreshHandler } from './http/LibraryRefreshHandler.js';
import { SSDPServer } from './ssdp/SSDPServer.js';
import type { FastifyInstance } from 'fastify';

// ──────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ──────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. Load config — exits with code 1 on any error
  const config = loadConfig();

  // 2. Create structured logger
  const logger = createLogger(config.logLevel);

  logger.info('DLNA Media Server starting…');

  // 3. Load device registry
  const deviceRegistry = new DeviceRegistry({ logger });
  deviceRegistry.load();

  // 4. Build media index
  const mediaIndex = new MediaIndex();

  // 5. Build base URL (used for resource URLs in DIDL-Lite and SSDP LOCATION)
  //    Determine the host address for the LOCATION header.  On Linux/macOS we
  //    pick the first non-loopback IPv4 address; fall back to 127.0.0.1.
  const host = getLocalIp();
  const baseUrl = `http://${host}:${config.port}`;

  // 6. Build media layer
  const scanner = new MediaScanner(mediaIndex, logger, baseUrl, config.ffprobeConcurrency);
  const watcher = new FilesystemWatcher(scanner, mediaIndex, logger);
  const library = new MediaLibrary(config.mediaDirectories, scanner, watcher, mediaIndex, logger, config);

  // 7. Build Fastify HTTP server
  const fastify: FastifyInstance = createHttpServer();

  // 8. Register middleware and routes (order matters: logger → auth → routes)
  registerRequestLogger(fastify, logger);
  registerAuthMiddleware(fastify, config, deviceRegistry);

  registerPINHandler(fastify, config, deviceRegistry, logger);
  registerDeviceDescription(fastify, config, baseUrl);
  registerMediaStreamer(fastify, mediaIndex, logger);
  registerContentDirectoryService(fastify, mediaIndex, logger, baseUrl);
  registerConnectionManagerService(fastify, logger);
  registerLibraryRefreshHandler(fastify, library, mediaIndex, logger);

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
  await startHttpServer(fastify, config.port);
  logger.info({ address: baseUrl }, 'HTTP server listening');

  // 11. Initial media scan then start watching
  await library.initialScan();
  library.startWatching();

  // 12. Build and start SSDP server
  const udn = loadOrCreateUdn();
  const ssdpServer = new SSDPServer(
    {
      port: 1900,
      location: `${baseUrl}/device.xml`,
      udn,
      serverName: config.friendlyName,
    },
    logger
  );

  try {
    await ssdpServer.start();
  } catch (err) {
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
        await stopHttpServer(fastify);

        // Step 2: drain active streams (max 10 s)
        if (activeStreams > 0) {
          logger.info({ activeStreams }, 'Waiting for active streams to drain…');
          await new Promise<void>((resolve) => {
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
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
      } finally {
        // Step 6: exit
        process.exit(0);
      }
    })();
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Helper — pick first non-loopback IPv4 address
// ──────────────────────────────────────────────────────────────────────────────

function getLocalIp(): string {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
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

main().catch((err: unknown) => {
  process.stderr.write(
    `[dlna-media-server] Fatal error: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
