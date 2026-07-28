import * as fs from 'fs';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from '../logger.js';
import type { MediaIndex } from '../media/MediaIndex.js';
import { parseRangeHeader } from './rangeParser.js';

/**
 * Registers GET and HEAD routes for `/stream/:itemId`.
 * Serves media files with byte-range support and DLNA headers.
 *
 * Design section 2.7
 * Requirements: 4.1, 4.2, 4.3, 4.5, 7.3
 */
export function registerMediaStreamer(
  fastify: FastifyInstance,
  index: MediaIndex,
  logger: Logger
): void {
  async function handleStream(
    request: FastifyRequest<{ Params: { itemId: string } }>,
    reply: FastifyReply,
    isHead: boolean
  ): Promise<void> {
    const { itemId } = request.params;

    const item = index.getById(itemId);
    if (!item || item.type !== 'item') {
      logger.warn({ itemId }, 'MediaStreamer: item not found or is a container');
      await reply.code(404).send({ error: 'Not found' });
      return;
    }

    let fileSize: number;
    try {
      fileSize = fs.statSync(item.filePath).size;
    } catch (err) {
      logger.warn({ itemId, filePath: item.filePath, err }, 'MediaStreamer: cannot stat file');
      await reply.code(404).send({ error: 'File not found on disk' });
      return;
    }

    const rangeHeader = request.headers['range'] as string | undefined;
    const parsedRange = parseRangeHeader(rangeHeader, fileSize);

    const mimeType = item.mimeType;
    const transferMode =
      mimeType.startsWith('video/') || mimeType.startsWith('audio/')
        ? 'Streaming'
        : 'Interactive';

    const orgFlags =
      'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000';
    const contentFeatures = item.dlnaProfile
      ? `DLNA.ORG_PN=${item.dlnaProfile};${orgFlags}`
      : orgFlags;

    void reply.header('Content-Type', mimeType);
    void reply.header('Accept-Ranges', 'bytes');
    void reply.header('transferMode.dlna.org', transferMode);
    void reply.header('contentFeatures.dlna.org', contentFeatures);

    if (isHead) {
      if (parsedRange) {
        void reply.header(
          'Content-Range',
          `bytes ${parsedRange.start}-${parsedRange.end}/${fileSize}`
        );
        void reply.header('Content-Length', String(parsedRange.end - parsedRange.start + 1));
        await reply.code(206).send();
      } else {
        void reply.header('Content-Length', String(fileSize));
        await reply.code(200).send();
      }
      return;
    }

    if (parsedRange) {
      const { start, end } = parsedRange;
      void reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      void reply.header('Content-Length', String(end - start + 1));
      reply.code(206);

      const stream = fs.createReadStream(item.filePath, { start, end });
      stream.on('error', (err) => {
        logger.error({ itemId, filePath: item.filePath, err }, 'MediaStreamer: read stream error');
        try { reply.raw.destroy(); } catch (_) { /* ignore */ }
      });
      stream.pipe(reply.raw);
    } else {
      void reply.header('Content-Length', String(fileSize));
      reply.code(200);

      const stream = fs.createReadStream(item.filePath);
      stream.on('error', (err) => {
        logger.error({ itemId, filePath: item.filePath, err }, 'MediaStreamer: read stream error');
        try { reply.raw.destroy(); } catch (_) { /* ignore */ }
      });
      stream.pipe(reply.raw);
    }
  }

  fastify.get<{ Params: { itemId: string } }>('/stream/:itemId', async (request, reply) => {
    await handleStream(request, reply, false);
  });

  fastify.head<{ Params: { itemId: string } }>('/stream/:itemId', async (request, reply) => {
    await handleStream(request, reply, true);
  });
}
