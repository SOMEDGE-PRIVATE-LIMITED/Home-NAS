"use strict";
/**
 * HTTP Range header parser for byte-range requests.
 *
 * Supports the three standard forms of the `Range: bytes=...` header:
 *   - `bytes=start-end`   : explicit range
 *   - `bytes=start-`      : open end (start to end of file)
 *   - `bytes=-suffix`     : last N bytes of the file
 *
 * Returns a clamped `{ start, end }` pair or `null` when the header is absent,
 * malformed, or specifies an empty/invalid range after clamping.
 *
 * Requirements: 4.2
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRangeHeader = parseRangeHeader;
/**
 * Parses the `Range` request header and returns a clamped byte range.
 *
 * @param rangeHeader - The raw value of the `Range` header (may be undefined).
 * @param fileSize    - The total size of the file being served, in bytes.
 * @returns A `{ start, end }` object (both inclusive), or `null` if the header
 *          is absent or cannot be interpreted as a valid byte range.
 */
function parseRangeHeader(rangeHeader, fileSize) {
    if (rangeHeader === undefined || rangeHeader === null) {
        return null;
    }
    // Only the "bytes" unit is supported (RFC 7233 §2.1)
    const match = rangeHeader.match(/^bytes=(.+)$/i);
    if (!match) {
        return null;
    }
    const rangeSpec = match[1].trim();
    // Form: -suffix (last N bytes)
    const suffixMatch = rangeSpec.match(/^-(\d+)$/);
    if (suffixMatch) {
        const suffix = parseInt(suffixMatch[1], 10);
        if (isNaN(suffix)) {
            return null;
        }
        const start = Math.max(0, fileSize - suffix);
        const end = fileSize - 1;
        if (start > end) {
            return null;
        }
        return { start, end };
    }
    // Form: start- or start-end
    const rangeMatch = rangeSpec.match(/^(\d+)-(\d*)$/);
    if (!rangeMatch) {
        return null;
    }
    const rawStart = parseInt(rangeMatch[1], 10);
    if (isNaN(rawStart)) {
        return null;
    }
    let rawEnd;
    if (rangeMatch[2] === '') {
        // Open-ended: bytes=start-
        rawEnd = fileSize - 1;
    }
    else {
        rawEnd = parseInt(rangeMatch[2], 10);
        if (isNaN(rawEnd)) {
            return null;
        }
    }
    // Clamp to valid file boundaries
    const start = Math.max(0, rawStart);
    const end = Math.min(fileSize - 1, rawEnd);
    if (start > end) {
        return null;
    }
    return { start, end };
}
//# sourceMappingURL=rangeParser.js.map