"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPINHandler = registerPINHandler;
/**
 * Strips the IPv4-mapped IPv6 prefix from an address string.
 *
 * Shared normalisation logic — mirrors AuthMiddleware behaviour.
 */
function normaliseIp(address) {
    return address.startsWith('::ffff:') ? address.slice(7) : address;
}
/**
 * Registers the `POST /pin` route on the Fastify instance.
 *
 * Request body: `{ "pin": "<string>" }`
 *
 * Success (PIN matches config):
 *  - Registers the client's IP via `DeviceRegistry.registerDevice`
 *  - Returns HTTP 200 `{ "status": "ok" }`
 *
 * Failure (wrong PIN):
 *  - Logs a warning with the client IP
 *  - Returns HTTP 403 `{ "error": "Forbidden" }`
 *
 * Requirements: 10.2
 */
function registerPINHandler(fastify, config, registry, logger) {
    fastify.post('/pin', {
        schema: {
            body: {
                type: 'object',
                required: ['pin'],
                properties: {
                    pin: { type: 'string' },
                },
            },
        },
    }, async (request, reply) => {
        const rawIp = request.socket.remoteAddress ?? '';
        const ip = normaliseIp(rawIp);
        const { pin } = request.body;
        if (pin === config.pin) {
            registry.registerDevice(ip);
            return reply.status(200).send({ status: 'ok' });
        }
        logger.warn({ ip }, 'PINHandler: failed PIN attempt');
        return reply.status(403).send({ error: 'Forbidden' });
    });
}
//# sourceMappingURL=PINHandler.js.map