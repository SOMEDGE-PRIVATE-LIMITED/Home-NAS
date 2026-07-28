import type { Logger } from '../logger.js';
import type { MediaIndex } from './MediaIndex.js';
import type { MediaScanner } from './MediaScanner.js';
import type { FilesystemWatcher } from './FilesystemWatcher.js';
/**
 * Coordinates the MediaScanner, FilesystemWatcher, and MediaIndex.
 *
 * Responsibilities:
 * - `initialScan()`: runs a full scan of all configured directories in parallel
 *   at startup to populate the index.
 * - `startWatching()`: begins continuous filesystem monitoring so that new,
 *   changed, or deleted files update the index in near-real-time.
 * - `stopWatching()`: tears down the filesystem watcher on graceful shutdown.
 *
 * Design section 2.8
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */
export declare class MediaLibrary {
    private readonly dirs;
    private readonly scanner;
    private readonly watcher;
    private readonly index;
    private readonly logger;
    constructor(dirs: string[], scanner: MediaScanner, watcher: FilesystemWatcher, index: MediaIndex, logger: Logger);
    /**
     * Scans all configured directories in parallel and populates the MediaIndex.
     *
     * All `scanner.scanDirectory()` calls run concurrently via `Promise.all` so
     * that large libraries on separate mount points are scanned simultaneously.
     *
     * Requirements: 6.1
     */
    initialScan(): Promise<void>;
    /**
     * Starts the FilesystemWatcher on all configured directories so that
     * subsequent file-system events update the MediaIndex in real time.
     *
     * Requirements: 6.2, 6.3
     */
    startWatching(): void;
    /**
     * Stops the FilesystemWatcher and releases underlying resources.
     *
     * Requirements: 6.4
     */
    stopWatching(): Promise<void>;
}
//# sourceMappingURL=MediaLibrary.d.ts.map