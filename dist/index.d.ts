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
export {};
//# sourceMappingURL=index.d.ts.map