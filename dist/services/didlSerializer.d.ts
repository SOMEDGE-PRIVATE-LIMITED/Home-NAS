import type { MediaItem, Container } from '../media/MediaIndex.js';
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
export declare function serializeToDidl(items: Array<MediaItem | Container>, filter: string, baseUrl: string): string;
//# sourceMappingURL=didlSerializer.d.ts.map