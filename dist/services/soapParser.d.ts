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
export declare function parseSoapAction(body: string, _soapActionHeader?: string): ParsedSoapAction;
//# sourceMappingURL=soapParser.d.ts.map