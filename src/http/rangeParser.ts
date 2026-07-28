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
export function parseRangeHeader(
  rangeHeader: string | undefined,
  fileSize: number
): ParsedRange | null {
  if (rangeHeader === undefined || rangeHeader === null) {
    return null;
  }

  const match = rangeHeader.match(/^bytes=(.+)$/i);
  if (!match) {
    return null;
  }

  const rangeSpec = match[1].trim();

  // Form: -suffix (last N bytes)
  const suffixMatch = rangeSpec.match(/^-(\d+)$/);
  if (suffixMatch) {
    const suffix = parseInt(suffixMatch[1], 10);
    if (isNaN(suffix)) return null;
    const start = Math.max(0, fileSize - suffix);
    const end = fileSize - 1;
    if (start > end) return null;
    return { start, end };
  }

  // Form: start- or start-end
  const rangeMatch = rangeSpec.match(/^(\d+)-(\d*)$/);
  if (!rangeMatch) return null;

  const rawStart = parseInt(rangeMatch[1], 10);
  if (isNaN(rawStart)) return null;

  let rawEnd: number;
  if (rangeMatch[2] === '') {
    rawEnd = fileSize - 1;
  } else {
    rawEnd = parseInt(rangeMatch[2], 10);
    if (isNaN(rawEnd)) return null;
  }

  const start = Math.max(0, rawStart);
  const end = Math.min(fileSize - 1, rawEnd);

  if (start > end) return null;
  return { start, end };
}
