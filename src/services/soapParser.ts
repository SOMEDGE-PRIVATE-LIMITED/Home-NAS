import { XMLParser } from 'fast-xml-parser';

// ──────────────────────────────────────────────────────────────────────────────
// Public interfaces
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Parsed representation of a UPnP SOAP action request.
 */
export interface ParsedSoapAction {
  /** The local action name, e.g. "Browse" or "Search". */
  actionName: string;
  /** The service namespace URI, e.g. "urn:schemas-upnp-org:service:ContentDirectory:1". */
  serviceNs: string;
  /** Key/value map of action arguments, all as strings. */
  args: Record<string, string>;
}

/**
 * Error shape thrown by `parseSoapAction` on malformed input.
 * The caller should translate this into an HTTP 400 SOAP fault response.
 */
export interface SoapParseError {
  statusCode: 400;
  upnpErrorCode: 402;
  message: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// XML parser (shared instance — stateless, safe to reuse)
// ──────────────────────────────────────────────────────────────────────────────

const parser = new XMLParser({
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
export function parseSoapAction(
  body: string,
  _soapActionHeader?: string
): ParsedSoapAction {
  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(body) as Record<string, unknown>;
  } catch (err) {
    throw {
      statusCode: 400,
      upnpErrorCode: 402,
      message: `XML parse error: ${err instanceof Error ? err.message : String(err)}`,
    } satisfies SoapParseError;
  }

  // Find Envelope element (may be prefixed e.g. "s:Envelope")
  const envelopeKey = Object.keys(parsed).find(
    (k) => stripNsPrefix(k) === 'Envelope'
  );
  if (!envelopeKey) {
    throw {
      statusCode: 400,
      upnpErrorCode: 402,
      message: 'Missing SOAP Envelope element',
    } satisfies SoapParseError;
  }

  const envelope = parsed[envelopeKey] as Record<string, unknown>;

  const bodyKey = Object.keys(envelope).find(
    (k) => stripNsPrefix(k) === 'Body'
  );
  if (!bodyKey) {
    throw {
      statusCode: 400,
      upnpErrorCode: 402,
      message: 'Missing SOAP Body element',
    } satisfies SoapParseError;
  }

  const bodyElement = envelope[bodyKey] as Record<string, unknown>;

  const actionKey = Object.keys(bodyElement).find(
    (k) => !k.startsWith('@_')
  );
  if (!actionKey) {
    throw {
      statusCode: 400,
      upnpErrorCode: 402,
      message: 'No action element found in SOAP Body',
    } satisfies SoapParseError;
  }

  const actionElement = bodyElement[actionKey] as Record<string, unknown> | undefined;
  const actionName = stripNsPrefix(actionKey);

  // Extract service namespace from xmlns attribute
  let serviceNs = '';
  if (actionElement && typeof actionElement === 'object') {
    const actionPrefix = actionKey.includes(':') ? actionKey.split(':')[0] : '';
    const xmlnsKey = actionPrefix ? `@_xmlns:${actionPrefix}` : '@_xmlns';
    const nsVal = actionElement[xmlnsKey];
    if (typeof nsVal === 'string') {
      serviceNs = nsVal;
    } else {
      for (const [attrKey, attrVal] of Object.entries(actionElement)) {
        if (attrKey.startsWith('@_xmlns:') && typeof attrVal === 'string') {
          serviceNs = attrVal;
          break;
        }
      }
    }
  }

  // Extract arguments
  const args: Record<string, string> = {};
  if (actionElement && typeof actionElement === 'object') {
    for (const [key, value] of Object.entries(actionElement)) {
      if (key.startsWith('@_')) continue;
      if (value === null || value === undefined) {
        args[key] = '';
      } else if (typeof value === 'object') {
        args[key] = '';
      } else {
        args[key] = String(value);
      }
    }
  }

  return { actionName, serviceNs, args };
}

function stripNsPrefix(key: string): string {
  const colonIdx = key.indexOf(':');
  return colonIdx === -1 ? key : key.slice(colonIdx + 1);
}
