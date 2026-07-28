"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeToDidl = serializeToDidl;
// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Serialises an array of `MediaItem` and/or `Container` objects to a
 * DIDL-Lite XML string suitable for use as the `<Result>` payload of a
 * UPnP ContentDirectory Browse or Search response.
 *
 * @param items   Items to include in the output.
 * @param filter  `"*"` to include all optional fields, or a comma-separated
 *                list of field keys to include in addition to mandatory fields.
 * @param baseUrl Base URL of the HTTP server, e.g. `"http://192.168.1.100:8200"`.
 *                Used to build `<res>` URLs for each item.
 *
 * Requirements: 2.2, 2.3, 2.6, 2.7, 2.8, 7.3, 7.4, 7.5
 */
function serializeToDidl(items, filter, baseUrl) {
    const filterAll = filter === '*';
    const filterSet = filterAll ? null : new Set(filter.split(',').map((f) => f.trim()));
    const includeField = (key) => filterAll || (filterSet !== null && filterSet.has(key));
    const children = items.map((item) => item.type === 'item'
        ? serializeItem(item, includeField, baseUrl)
        : serializeContainer(item));
    return (`<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"` +
        ` xmlns:dc="http://purl.org/dc/elements/1.1/"` +
        ` xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"` +
        ` xmlns:dlna="urn:schemas-dlna-org:metadata-1-0/">` +
        children.join('') +
        `</DIDL-Lite>`);
}
// ──────────────────────────────────────────────────────────────────────────────
// Item serialisation
// ──────────────────────────────────────────────────────────────────────────────
function serializeItem(item, includeField, baseUrl) {
    const upnpClass = mimeToUpnpClass(item.mimeType);
    const isAudio = upnpClass === 'object.item.audioItem';
    // Build the <res> element attributes
    const resAttrs = buildResAttributes(item, includeField, baseUrl);
    // Build the <res> URL
    const resUrl = xmlEscape(item.resourceUrl || `${baseUrl}/stream/${item.id}`);
    let xml = `<item id="${xmlEscape(item.id)}" parentID="${xmlEscape(item.parentId)}" restricted="1">` +
        `<dc:title>${xmlEscape(item.title)}</dc:title>` +
        `<upnp:class>${upnpClass}</upnp:class>` +
        `<res${resAttrs}>${resUrl}</res>`;
    // ── Optional audio fields ────────────────────────────────────────────────
    if (isAudio) {
        // sampleFrequency and bitrate are audio-specific optional fields
        // These are already embedded in <res> attributes (handled in buildResAttributes)
        // Nothing additional to add at the element level for standard DIDL
    }
    xml += `</item>`;
    return xml;
}
function buildResAttributes(item, includeField, baseUrl) {
    const upnpClass = mimeToUpnpClass(item.mimeType);
    const isAudio = upnpClass === 'object.item.audioItem';
    // Build DLNA features string
    const dlnaFeatures = buildDlnaFeatures(item.dlnaProfile);
    // protocolInfo is mandatory
    const protocolInfo = `http-get:*:${item.mimeType}:${dlnaFeatures}`;
    let attrs = ` protocolInfo="${xmlEscape(protocolInfo)}"` +
        ` size="${item.fileSize}"`;
    // Optional: duration
    if (item.duration !== undefined && includeField('res@duration')) {
        attrs += ` duration="${xmlEscape(item.duration)}"`;
    }
    // Optional: resolution (video)
    if (item.resolution !== undefined && includeField('res@resolution')) {
        attrs += ` resolution="${xmlEscape(item.resolution)}"`;
    }
    // Optional: bitrate (audio)
    if (isAudio && item.bitrate !== undefined && includeField('res@bitrate')) {
        attrs += ` bitrate="${item.bitrate}"`;
    }
    // Optional: sampleFrequency (audio)
    if (isAudio && item.sampleRate !== undefined && includeField('res@sampleFrequency')) {
        attrs += ` sampleFrequency="${item.sampleRate}"`;
    }
    // Optional: dlna:profileID attribute on res element
    if (item.dlnaProfile !== undefined && includeField('dlna:profileID')) {
        attrs += ` dlna:profileID="${xmlEscape(item.dlnaProfile)}"`;
    }
    return attrs;
}
// ──────────────────────────────────────────────────────────────────────────────
// Container serialisation
// ──────────────────────────────────────────────────────────────────────────────
function serializeContainer(container) {
    return (`<container id="${xmlEscape(container.id)}"` +
        ` parentID="${xmlEscape(container.parentId)}"` +
        ` restricted="1"` +
        ` childCount="${container.childCount}">` +
        `<dc:title>${xmlEscape(container.title)}</dc:title>` +
        `<upnp:class>object.container.storageFolder</upnp:class>` +
        `</container>`);
}
// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Maps a MIME type to its UPnP object class string.
 */
function mimeToUpnpClass(mimeType) {
    if (mimeType.startsWith('video/'))
        return 'object.item.videoItem';
    if (mimeType.startsWith('audio/'))
        return 'object.item.audioItem';
    if (mimeType.startsWith('image/'))
        return 'object.item.imageItem';
    return 'object.item';
}
/**
 * Builds the DLNA features string used in `protocolInfo`.
 *
 * With profile:    `DLNA.ORG_PN=<profile>;DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=...`
 * Without profile: `DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=...`
 */
function buildDlnaFeatures(dlnaProfile) {
    const flags = 'DLNA.ORG_FLAGS=01700000000000000000000000000000';
    const op = 'DLNA.ORG_OP=01';
    const ci = 'DLNA.ORG_CI=0';
    if (dlnaProfile) {
        return `DLNA.ORG_PN=${dlnaProfile};${op};${ci};${flags}`;
    }
    return `${op};${ci};${flags}`;
}
/**
 * Escapes the five XML special characters in a string value.
 */
function xmlEscape(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
//# sourceMappingURL=didlSerializer.js.map