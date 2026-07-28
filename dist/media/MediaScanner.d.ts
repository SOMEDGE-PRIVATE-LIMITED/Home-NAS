import type { Logger } from '../logger.js';
import { type MediaIndex, type FileMetadata } from './MediaIndex.js';
/** All supported file extensions (lowercase). */
export declare const SUPPORTED_EXTENSIONS: Set<string>;
/**
 * Scans configured directories, identifies supported media files by extension,
 * extracts metadata via ffprobe, and upserts items into the MediaIndex.
 *
 * Design section 2.9
 * Requirements: 6.1, 6.5, 2.7, 2.8
 */
export declare class MediaScanner {
    private readonly index;
    private readonly logger;
    private readonly baseUrl;
    private readonly semaphore;
    /** Set to true after the first ffprobe failure caused by missing ffprobe binary. */
    private ffprobeUnavailable;
    constructor(index: MediaIndex, logger: Logger, baseUrl: string, 
    /** Max parallel ffprobe calls. Defaults to 4. Lower values reduce disk I/O on slow drives. */
    ffprobeConcurrency?: number);
    /**
     * Indexes a single file: checks that its extension is supported, then probes
     * and upserts it into the MediaIndex.
     *
     * Intended for use by `FilesystemWatcher` to handle `add` and `change`
     * events for individual files without having to re-scan entire directories.
     *
     * Requirements: 6.2, 6.3
     */
    indexFile(filePath: string): Promise<void>;
    /**
     * Recursively walks `dir`, finds all supported media files, and upserts each
     * one into the MediaIndex with its resolved metadata.
     *
     * Non-existent directories are skipped with a warning log (requirement 6.1).
     *
     * Requirements: 6.1, 6.5
     */
    scanDirectory(dir: string): Promise<void>;
    /**
     * Probes a single file with ffprobe and returns raw FileMetadata.
     * Returns `null` when ffprobe is unavailable or the probe fails.
     *
     * Requirements: 2.7, 2.8
     */
    probeFile(filePath: string): Promise<FileMetadata | null>;
    /** Process a single media file: probe + upsert into the index. */
    private _processFile;
    /**
     * Wraps the callback-based `ffprobe()` function from fluent-ffmpeg in a
     * Promise.  Handles the case where ffprobe is not installed.
     */
    private _runFfprobe;
}
//# sourceMappingURL=MediaScanner.d.ts.map