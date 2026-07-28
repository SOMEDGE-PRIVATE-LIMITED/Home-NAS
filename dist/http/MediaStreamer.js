"use strict";
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
exports.registerMediaStreamer = registerMediaStreamer;
const fs = __importStar(require("fs"));
const rangeParser_js_1 = require("./rangeParser.js");
/**
 * Registers GET and HEAD routes for `/stream/:itemId` on the given Fastify
 * instance.  Serves media files with full HTTP byte-range support and the DLNA
 * headers required by Samsung Tizen TV clients.
 *
 * Design section 2.7
 * Requirements: 4.1, 4.2, 4.3, 4.5, 7.3
 */
function registerMediaStreamer(fastify, index, logger) {
    // Shared handler logic — used by both GET and HEAD
    async function handleStream(request, reply, isHead) {
        const { itemId } = request.params;
        // 1. Look up the item in the index
        const item = index.getById(itemId);
        if (!item || item.type !== 'item') {
            logger.warn({ itemId }, 'MediaStreamer: item not found or is a container');
            await reply.code(404).send({ error: 'Not found' });
            return;
        }
        // 2. Get file size from disk
        let fileSize;
        try {
            const stat = fs.statSync(item.filePath);
            fileSize = stat.size;
        }
        catch (err) {
            logger.warn({ itemId, filePath: item.filePath, err }, 'MediaStreamer: cannot stat file');
            await reply.code(404).send({ error: 'File not found on disk' });
            return;
        }
        // 3. Parse Range header
        const rangeHeader = request.headers['range'];
        const parsedRange = (0, rangeParser_js_1.parseRangeHeader)(rangeHeader, fileSize);
        // 4. Determine DLNA transferMode based on MIME type
        const mimeType = item.mimeType;
        let transferMode;
        if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
            transferMode = 'Streaming';
        }
        else {
            transferMode = 'Interactive';
        }
        // 5. Build contentFeatures string
        let contentFeatures;
        const orgFlags = 'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000';
        if (item.dlnaProfile) {
            contentFeatures = `DLNA.ORG_PN=${item.dlnaProfile};${orgFlags}`;
        }
        else {
            contentFeatures = orgFlags;
        }
        // 6. Set common headers
        void reply.header('Content-Type', mimeType);
        void reply.header('Accept-Ranges', 'bytes');
        void reply.header('transferMode.dlna.org', transferMode);
        void reply.header('contentFeatures.dlna.org', contentFeatures);
        if (isHead) {
            // HEAD: send headers only, no body
            if (parsedRange) {
                void reply.header('Content-Length', String(parsedRange.end - parsedRange.start + 1));
                void reply.header('Content-Range', `bytes ${parsedRange.start}-${parsedRange.end}/${fileSize}`);
                await reply.code(206).send();
            }
            else {
                void reply.header('Content-Length', String(fileSize));
                await reply.code(200).send();
            }
            return;
        }
        // GET — stream the file
        if (parsedRange) {
            // 7. Partial content response
            const { start, end } = parsedRange;
            const contentLength = end - start + 1;
            void reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            void reply.header('Content-Length', String(contentLength));
            reply.code(206);
            const stream = fs.createReadStream(item.filePath, { start, end });
            stream.on('error', (err) => {
                logger.error({ itemId, filePath: item.filePath, err }, 'MediaStreamer: read stream error');
                try {
                    reply.raw.destroy();
                }
                catch (_) {
                    // ignore errors during cleanup
                }
            });
            stream.pipe(reply.raw);
        }
        else {
            // 8. Full file response
            void reply.header('Content-Length', String(fileSize));
            reply.code(200);
            const stream = fs.createReadStream(item.filePath);
            stream.on('error', (err) => {
                logger.error({ itemId, filePath: item.filePath, err }, 'MediaStreamer: read stream error');
                try {
                    reply.raw.destroy();
                }
                catch (_) {
                    // ignore errors during cleanup
                }
            });
            stream.pipe(reply.raw);
        }
    }
    fastify.get('/stream/:itemId', async (request, reply) => {
        await handleStream(request, reply, false);
    });
    fastify.head('/stream/:itemId', async (request, reply) => {
        await handleStream(request, reply, true);
    });
}
//# sourceMappingURL=MediaStreamer.js.map