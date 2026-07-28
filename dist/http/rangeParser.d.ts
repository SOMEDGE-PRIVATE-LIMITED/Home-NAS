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
export interface ParsedRange {
    start: number;
    end: number;
}
/**
 * Parses the `Range` request header and returns a clamped byte range.
 *
 * @param rangeHeader - The raw value of the `Range` header (may be undefined).
 * @param fileSize    - The total size of the file being served, in bytes.
 * @returns A `{ start, end }` object (both inclusive), or `null`.
 */
export declare function parseRangeHeader(rangeHeader: string | undefined, fileSize: number): ParsedRange | null;
//# sourceMappingURL=rangeParser.d.ts.map