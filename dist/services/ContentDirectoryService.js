"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerContentDirectoryService = registerContentDirectoryService;
exports.paginate = paginate;
const soapParser_js_1 = require("./soapParser.js");
const didlSerializer_js_1 = require("./didlSerializer.js");
// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────
const CD_NS = 'urn:schemas-upnp-org:service:ContentDirectory:1';
/** UpdateID is a static "1" — we do not implement change-tracking. */
const UPDATE_ID = '1';
/** Regex for the only supported SearchCriteria pattern. */
const TITLE_CONTAINS_RE = /dc:title\s+contains\s+"(.+)"/i;
// ──────────────────────────────────────────────────────────────────────────────
// Route registration
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Registers the `POST /cd/control` route that handles UPnP ContentDirectory
 * SOAP actions: `Browse` and `Search`.
 *
 * Requirements: 2.1–2.5, 2.9–2.12
 */
function registerContentDirectoryService(fastify, index, logger, baseUrl) {
    fastify.post('/cd/control', async (request, reply) => {
        const rawBody = request.body;
        const soapActionHeader = request.headers['soapaction'] ??
            request.headers['SOAPAction'];
        let actionName;
        let args;
        let serviceNs;
        // ── Parse SOAP envelope ─────────────────────────────────────────────────
        try {
            const parsed = (0, soapParser_js_1.parseSoapAction)(rawBody, soapActionHeader);
            actionName = parsed.actionName;
            args = parsed.args;
            serviceNs = parsed.serviceNs;
        }
        catch (err) {
            const parseErr = err;
            logger.warn({ err: parseErr }, 'SOAP parse error');
            return reply
                .status(400)
                .header('Content-Type', 'text/xml; charset="utf-8"')
                .send(buildSoapFault(400, 'Invalid Args'));
        }
        logger.debug({ actionName, serviceNs }, 'ContentDirectory SOAP action');
        // ── Dispatch to handler ─────────────────────────────────────────────────
        let responseXml;
        try {
            if (actionName === 'Browse') {
                responseXml = handleBrowse(args, index, logger, baseUrl);
            }
            else if (actionName === 'Search') {
                responseXml = handleSearch(args, index, logger, baseUrl);
            }
            else {
                // Unsupported action — return UPnP 401 Invalid Action
                responseXml = buildSoapFault(401, 'Invalid Action');
            }
        }
        catch (err) {
            logger.error({ err }, 'ContentDirectory handler error');
            responseXml = buildSoapFault(501, 'Action Failed');
        }
        return reply
            .status(200)
            .header('Content-Type', 'text/xml; charset="utf-8"')
            .send(responseXml);
    });
}
// ──────────────────────────────────────────────────────────────────────────────
// Browse handler
// ──────────────────────────────────────────────────────────────────────────────
function handleBrowse(args, index, logger, baseUrl) {
    const objectId = args['ObjectID'] ?? '0';
    const browseFlag = args['BrowseFlag'] ?? 'BrowseDirectChildren';
    const filter = args['Filter'] ?? '*';
    const startingIndex = parseInt(args['StartingIndex'] ?? '0', 10) || 0;
    const requestedCount = parseInt(args['RequestedCount'] ?? '0', 10) || 0;
    let items;
    let totalMatches;
    let numberReturned;
    if (browseFlag === 'BrowseMetadata') {
        // Return the single item or container itself
        const found = index.getById(objectId);
        if (!found) {
            logger.warn({ objectId }, 'BrowseMetadata: object not found');
            return buildSoapFault(701, 'No Such Object');
        }
        items = [found];
        totalMatches = 1;
        numberReturned = 1;
    }
    else {
        // BrowseDirectChildren (default)
        const allChildren = index.getChildren(objectId);
        const paginated = paginate(allChildren, startingIndex, requestedCount);
        items = paginated.slice;
        totalMatches = paginated.totalMatches;
        numberReturned = paginated.numberReturned;
    }
    const didl = (0, didlSerializer_js_1.serializeToDidl)(items, filter, baseUrl);
    return buildBrowseResponse('Browse', didl, numberReturned, totalMatches);
}
// ──────────────────────────────────────────────────────────────────────────────
// Search handler
// ──────────────────────────────────────────────────────────────────────────────
function handleSearch(args, index, logger, baseUrl) {
    const searchCriteria = args['SearchCriteria'] ?? '';
    const filter = args['Filter'] ?? '*';
    const startingIndex = parseInt(args['StartingIndex'] ?? '0', 10) || 0;
    const requestedCount = parseInt(args['RequestedCount'] ?? '0', 10) || 0;
    // Only dc:title contains "term" is supported
    const match = TITLE_CONTAINS_RE.exec(searchCriteria);
    if (!match) {
        logger.warn({ searchCriteria }, 'Unsupported SearchCriteria');
        return buildSoapFault(720, 'Cannot Process The Request');
    }
    const term = match[1];
    const allResults = index.search(term);
    const paginated = paginate(allResults, startingIndex, requestedCount);
    const didl = (0, didlSerializer_js_1.serializeToDidl)(paginated.slice, filter, baseUrl);
    return buildBrowseResponse('Search', didl, paginated.numberReturned, paginated.totalMatches);
}
// ──────────────────────────────────────────────────────────────────────────────
// Pagination
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Applies UPnP pagination to an ordered result set.
 *
 * - If `requestedCount` is 0, all items from `startingIndex` are returned.
 * - `numberReturned` = `min(requestedCount, max(0, total - startingIndex))`
 *   (or all remaining when requestedCount=0)
 *
 * Requirements: 2.5, 2.11
 */
function paginate(items, startingIndex, requestedCount) {
    const total = items.length;
    const start = Math.max(0, startingIndex);
    const available = Math.max(0, total - start);
    let count;
    if (requestedCount === 0) {
        count = available;
    }
    else {
        count = Math.min(requestedCount, available);
    }
    return {
        slice: items.slice(start, start + count),
        totalMatches: total,
        numberReturned: count,
    };
}
// ──────────────────────────────────────────────────────────────────────────────
// SOAP envelope builders
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Wraps a DIDL-Lite result in a SOAP BrowseResponse (or SearchResponse) envelope.
 */
function buildBrowseResponse(actionName, didl, numberReturned, totalMatches) {
    const escapedDidl = xmlEscape(didl);
    return (`<?xml version="1.0" encoding="utf-8"?>` +
        `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">` +
        `<s:Body>` +
        `<u:${actionName}Response xmlns:u="${CD_NS}">` +
        `<Result>${escapedDidl}</Result>` +
        `<NumberReturned>${numberReturned}</NumberReturned>` +
        `<TotalMatches>${totalMatches}</TotalMatches>` +
        `<UpdateID>${UPDATE_ID}</UpdateID>` +
        `</u:${actionName}Response>` +
        `</s:Body>` +
        `</s:Envelope>`);
}
/**
 * Builds a SOAP fault envelope with a UPnP error code and description.
 *
 * Per UPnP Device Architecture 1.1 §3, faults are returned as HTTP 200 with
 * a `s:Fault` body (except for parse errors which may be HTTP 400).
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
//# sourceMappingURL=ContentDirectoryService.js.map