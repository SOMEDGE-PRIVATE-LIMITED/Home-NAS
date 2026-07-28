"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHttpServer = createHttpServer;
exports.startHttpServer = startHttpServer;
exports.stopHttpServer = stopHttpServer;
const fastify_1 = __importDefault(require("fastify"));
/**
 * Creates and configures a Fastify HTTP server instance.
 *
 * - Logger is disabled in Fastify itself; structured logging is handled via pino
 *   passed separately to service handlers.
 * - Registers content-type parsers for SOAP XML bodies (`text/xml` and
 *   `application/soap+xml`) so they are delivered as raw strings rather than
 *   being rejected by Fastify's default parser.
 *
 * Routes are registered externally by calling the appropriate register*
 * functions on the returned instance.
 *
 * Requirements: 5.5
 */
function createHttpServer() {
    const fastify = (0, fastify_1.default)({ logger: false });
    // Register SOAP content-type parsers — deliver body as raw string
    fastify.addContentTypeParser('text/xml', { parseAs: 'string' }, (_req, body, done) => done(null, body));
    fastify.addContentTypeParser('application/soap+xml', { parseAs: 'string' }, (_req, body, done) => done(null, body));
    return fastify;
}
/**
 * Starts the Fastify server, binding to all interfaces on the given port.
 *
 * Requirements: 5.5
 */
async function startHttpServer(fastify, port) {
    await fastify.listen({ port, host: '0.0.0.0' });
}
/**
 * Stops the Fastify server, draining in-flight connections.
 *
 * Requirements: 5.5
 */
async function stopHttpServer(fastify) {
    await fastify.close();
}
//# sourceMappingURL=server.js.map