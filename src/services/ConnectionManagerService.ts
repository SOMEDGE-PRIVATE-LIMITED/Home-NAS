import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

import { parseSoapAction } from './soapParser.js';

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const CM_NS = 'urn:schemas-upnp-org:service:ConnectionManager:1';

/**
 * Static list of supported MIME types (design section 2.6).
 * Each entry is formatted as required by UPnP ConnectionManager:
 *   http-get:*:<mimeType>:*
 *
 * Requirements: 3.2, 3.3
 */
const SUPPORTED_MIME_TYPES: readonly string[] = [
  'video/mp4',
  'video/x-matroska',
  'video/avi',
  'video/quicktime',
  'audio/mpeg',
  'audio/flac',
  'audio/aac',
  'audio/mp4',
  'image/jpeg',
  'image/png',
];

const SOURCE_PROTOCOL_INFO = SUPPORTED_MIME_TYPES.map(
  (mime) => `http-get:*:${mime}:*`
).join(',');

// ──────────────────────────────────────────────────────────────────────────────
// Route registration
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Registers the `POST /cm/control` route that handles UPnP ConnectionManager
 * SOAP actions. Currently only `GetProtocolInfo` is supported.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
export function registerConnectionManagerService(
  fastify: FastifyInstance,
  logger: Logger
): void {
  fastify.post('/cm/control', async (request, reply) => {
    const rawBody = request.body as string;
    const soapActionHeader =
      (request.headers['soapaction'] as string | undefined) ??
      (request.headers['SOAPAction'] as string | undefined);

    let actionName: string;
    let serviceNs: string;

    // ── Parse SOAP envelope ─────────────────────────────────────────────────
    try {
      const parsed = parseSoapAction(rawBody, soapActionHeader);
      actionName = parsed.actionName;
      serviceNs = parsed.serviceNs;
    } catch (err: unknown) {
      const parseErr = err as { statusCode: number; upnpErrorCode: number; message: string };
      logger.warn({ err: parseErr }, 'ConnectionManager SOAP parse error');
      return reply
        .status(400)
        .header('Content-Type', 'text/xml; charset="utf-8"')
        .send(buildSoapFault(402, 'Invalid Args'));
    }

    logger.debug({ actionName, serviceNs }, 'ConnectionManager SOAP action');

    // ── Dispatch to handler ─────────────────────────────────────────────────
    let responseXml: string;
    try {
      if (actionName === 'GetProtocolInfo') {
        responseXml = buildGetProtocolInfoResponse();
      } else {
        // Unsupported action — return UPnP 401 Invalid Action
        responseXml = buildSoapFault(401, 'Invalid Action');
      }
    } catch (err: unknown) {
      logger.error({ err }, 'ConnectionManager handler error');
      responseXml = buildSoapFault(501, 'Action Failed');
    }

    return reply
      .status(200)
      .header('Content-Type', 'text/xml; charset="utf-8"')
      .send(responseXml);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// SOAP response builders
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Builds a SOAP GetProtocolInfoResponse envelope.
 *
 * `Source` contains the comma-separated list of protocol info strings for all
 * supported MIME types. `Sink` is empty — the server only sources media, it
 * never sinks (receives) it.
 *
 * Requirements: 3.2, 3.3, 3.4
 */
function buildGetProtocolInfoResponse(): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<s:Body>` +
    `<u:GetProtocolInfoResponse xmlns:u="${CM_NS}">` +
    `<Source>${SOURCE_PROTOCOL_INFO}</Source>` +
    `<Sink></Sink>` +
    `</u:GetProtocolInfoResponse>` +
    `</s:Body>` +
    `</s:Envelope>`
  );
}

/**
 * Builds a SOAP fault envelope with a UPnP error code and description.
 */
function buildSoapFault(errorCode: number, errorDescription: string): string {
  return (
    `<?xml version="1.0"?>` +
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<s:Body>` +
    `<s:Fault>` +
    `<faultcode>s:Client</faultcode>` +
    `<faultstring>UPnPError</faultstring>` +
    `<detail>` +
    `<UPnPError xmlns="urn:schemas-upnp-org:control-1-0">` +
    `<errorCode>${errorCode}</errorCode>` +
    `<errorDescription>${xmlEscape(errorDescription)}</errorDescription>` +
    `</UPnPError>` +
    `</detail>` +
    `</s:Fault>` +
    `</s:Body>` +
    `</s:Envelope>`
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
