"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSoapAction = parseSoapAction;
const fast_xml_parser_1 = require("fast-xml-parser");
// ──────────────────────────────────────────────────────────────────────────────
// XML parser (shared instance — stateless, safe to reuse)
// ──────────────────────────────────────────────────────────────────────────────
const parser = new fast_xml_parser_1.XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
});
// ──────────────────────────────────────────────────────────────────────────────
// parseSoapAction
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Parses a SOAP 1.1 envelope and extracts the action name, service namespace,
 * and argument map.
 *
 * Throws a `SoapParseError` object (statusCode 400, upnpErrorCode 402) for:
 * - XML parse failures
 * - Missing or malformed SOAP envelope / Body element
 * - No action element found inside Body
 *
 * Requirements: 2.1
 */
function parseSoapAction(body, _soapActionHeader) {
    let parsed;
    try {
        parsed = parser.parse(body);
    }
    catch (err) {
        throw {
            statusCode: 400,
            upnpErrorCode: 402,
            message: `XML parse error: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
    // Find Envelope element (may be prefixed e.g. "s:Envelope")
    const envelopeKey = Object.keys(parsed).find((k) => stripNsPrefix(k) === 'Envelope');
    if (!envelopeKey) {
        throw {
            statusCode: 400,
            upnpErrorCode: 402,
            message: 'Missing SOAP Envelope element',
        };
    }
    const envelope = parsed[envelopeKey];
    const bodyKey = Object.keys(envelope).find((k) => stripNsPrefix(k) === 'Body');
    if (!bodyKey) {
        throw {
            statusCode: 400,
            upnpErrorCode: 402,
            message: 'Missing SOAP Body element',
        };
    }
    const bodyElement = envelope[bodyKey];
    const actionKey = Object.keys(bodyElement).find((k) => !k.startsWith('@_'));
    if (!actionKey) {
        throw {
            statusCode: 400,
            upnpErrorCode: 402,
            message: 'No action element found in SOAP Body',
        };
    }
    const actionElement = bodyElement[actionKey];
    const actionName = stripNsPrefix(actionKey);
    // Extract service namespace from xmlns attribute
    let serviceNs = '';
    if (actionElement && typeof actionElement === 'object') {
        const actionPrefix = actionKey.includes(':') ? actionKey.split(':')[0] : '';
        const xmlnsKey = actionPrefix ? `@_xmlns:${actionPrefix}` : '@_xmlns';
        const nsVal = actionElement[xmlnsKey];
        if (typeof nsVal === 'string') {
            serviceNs = nsVal;
        }
        else {
            for (const [attrKey, attrVal] of Object.entries(actionElement)) {
                if (attrKey.startsWith('@_xmlns:') && typeof attrVal === 'string') {
                    serviceNs = attrVal;
                    break;
                }
            }
        }
    }
    // Extract arguments
    const args = {};
    if (actionElement && typeof actionElement === 'object') {
        for (const [key, value] of Object.entries(actionElement)) {
            if (key.startsWith('@_'))
                continue;
            if (value === null || value === undefined) {
                args[key] = '';
            }
            else if (typeof value === 'object') {
                args[key] = '';
            }
            else {
                args[key] = String(value);
            }
        }
    }
    return { actionName, serviceNs, args };
}
function stripNsPrefix(key) {
    const colonIdx = key.indexOf(':');
    return colonIdx === -1 ? key : key.slice(colonIdx + 1);
}
//# sourceMappingURL=soapParser.js.map