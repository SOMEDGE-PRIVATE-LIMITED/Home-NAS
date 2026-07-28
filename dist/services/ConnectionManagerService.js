"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerConnectionManagerService = registerConnectionManagerService;
const soapParser_js_1 = require("./soapParser.js");
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
const SUPPORTED_MIME_TYPES = [
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
const SOURCE_PROTOCOL_INFO = SUPPORTED_MIME_TYPES.map((mime) => `http-get:*:${mime}:*`).join(',');
// ──────────────────────────────────────────────────────────────────────────────
// Route registration
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Registers the `POST /cm/control` route that handles UPnP ConnectionManager
 * SOAP actions. Currently only `GetProtocolInfo` is supported.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
function registerConnectionManagerService(fastify, logger) {
    fastify.post('/cm/control', async (request, reply) => {
        const rawBody = request.body;
        const soapActionHeader = request.headers['soapaction'] ??
            request.headers['SOAPAction'];
        let actionName;
        let serviceNs;
        // ── Parse SOAP envelope ─────────────────────────────────────────────────
        try {
            const parsed = (0, soapParser_js_1.parseSoapAction)(rawBody, soapActionHeader);
            actionName = parsed.actionName;
            serviceNs = parsed.serviceNs;
        }
        catch (err) {
            const parseErr = err;
            logger.warn({ err: parseErr }, 'ConnectionManager SOAP parse error');
            return reply
                .status(400)
                .header('Content-Type', 'text/xml; charset="utf-8"')
                .send(buildSoapFault(402, 'Invalid Args'));
        }
        logger.debug({ actionName, serviceNs }, 'ConnectionManager SOAP action');
        // ── Dispatch to handler ─────────────────────────────────────────────────
        let responseXml;
        try {
            if (actionName === 'GetProtocolInfo') {
                responseXml = buildGetProtocolInfoResponse();
            }
            else {
                // Unsupported action — return UPnP 401 Invalid Action
                responseXml = buildSoapFault(401, 'Invalid Action');
            }
        }
        catch (err) {
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
function buildGetProtocolInfoResponse() {
    return (`<?xml version="1.0" encoding="utf-8"?>` +
        `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">` +
        `<s:Body>` +
        `<u:GetProtocolInfoResponse xmlns:u="${CM_NS}">` +
        `<Source>${SOURCE_PROTOCOL_INFO}</Source>` +
        `<Sink></Sink>` +
        `</u:GetProtocolInfoResponse>` +
        `</s:Body>` +
        `</s:Envelope>`);
}
/**
 * Builds a SOAP fault envelope with a UPnP error code and description.
 */
function buildSoapFault(errorCode, errorDescription) {
    return (`<?xml version="1.0"?>` +
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
        `</s:Envelope>`);
}
// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function xmlEscape(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
//# sourceMappingURL=ConnectionManagerService.js.map