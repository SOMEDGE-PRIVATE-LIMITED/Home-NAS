// HTTP server module — implemented in Task 10: HTTP server setup (Fastify)

export { createHttpServer, startHttpServer, stopHttpServer } from './server.js';
export { registerDeviceDescription, loadOrCreateUdn } from './DeviceDescription.js';
export { registerMediaStreamer } from './MediaStreamer.js';
export { parseRangeHeader } from './rangeParser.js';
export type { ParsedRange } from './rangeParser.js';
