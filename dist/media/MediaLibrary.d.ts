import type { Logger } from '../logger.js';
import type { MediaIndex } from './MediaIndex.js';
import type { MediaScanner } from './MediaScanner.js';
import type { FilesystemWatcher } from './FilesystemWatcher.js';
import type { ServerConfig } from '../config/ConfigLoader.js';
/**
 * Coordinates the MediaScanner, FilesystemWatcher, and MediaIndex.
 *
 * Library refresh strategy is controlled by `config.watchMode`:
 *
 * - `"fsevents"` (default): starts `FilesystemWatcher` (chokidar/FSEvents).
 *   Best for SSDs and fast HDDs — zero polling overhead, instant detection.
 *
 * - `"interval"`: no chokidar. A `setInterval` triggers a sequential full
 *   re-scan of all directories every `config.scanIntervalSeconds` seconds.
 *   Directories are scanned one at a time (staggered) to avoid simultaneous
 *   disk I/O — safe on slow 1 TB mechanical drives.
 *
 * - `"manual"`: no automatic refresh at all. The library is populated on
 *   startup via `initialScan()` and updated only via `refresh()` (which is
 *   triggered by `POST /library/refresh`).
 *
 * Design section 2.8
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 6.8
 */
export declare class MediaLibrary {
    private readonly dirs;
    private readonly scanner;
    private readonly watcher;
    private readonly index;
    private readonly logger;
    private readonly config;
    /** Active interval handle when watchMode="interval". */
    private intervalHandle;
    /** Guard to prevent concurrent scans (interval overlap or refresh during scan). */
    private scanInProgress;
    constructor(dirs: string[], scanner: MediaScanner, watcher: FilesystemWatcher, index: MediaIndex, logger: Logger, config: Pick<ServerConfig, 'watchMode' | 'scanIntervalSeconds'>);
    /**
     * Scans all configured directories in parallel and populates the MediaIndex.
     * Uses Promise.all so that separate mount points are scanned concurrently,
     * while ffprobe concurrency is already capped inside MediaScanner.
     *
     * Requirements: 6.1
     */
    initialScan(): Promise<void>;
    /**
     * Starts automatic library refresh based on `config.watchMode`.
     *
     * - `"fsevents"`: starts FilesystemWatcher (native FSEvents).
     * - `"interval"`: starts a setInterval that re-scans all directories
     *   **sequentially** (staggered) to avoid simultaneous disk I/O on slow HDDs.
     * - `"manual"`: no-op.
     *
     * Requirements: 6.2, 6.3, 6.6, 6.7
     */
    startWatching(): void;
    /**
     * Stops the active watcher or interval timer.
     *
     * Requirements: 6.4
     */
    stopWatching(): Promise<void>;
    /**
     * Triggers an immediate full re-scan of all configured directories,
     * regardless of `watchMode`. Directories are scanned sequentially
     * (staggered) to limit simultaneous disk I/O.
     *
     * Returns `false` if a scan is already running (caller should 503).
     *
     * Requirements: 6.8
     */
    refresh(): Promise<boolean>;
    /**
     * Scans each configured directory one at a time (sequential / staggered)
     * so that disk reads from multiple directories do not overlap.  This is
     * the approach used by both interval-mode and manual refresh.
     */
    private _runSequentialScan;
}
//# sourceMappingURL=MediaLibrary.d.ts.map