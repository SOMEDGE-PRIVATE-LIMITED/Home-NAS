"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaLibrary = void 0;
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
class MediaLibrary {
    dirs;
    scanner;
    watcher;
    index;
    logger;
    config;
    /** Active interval handle when watchMode="interval". */
    intervalHandle = null;
    /** Guard to prevent concurrent scans (interval overlap or refresh during scan). */
    scanInProgress = false;
    constructor(dirs, scanner, watcher, index, logger, config) {
        this.dirs = dirs;
        this.scanner = scanner;
        this.watcher = watcher;
        this.index = index;
        this.logger = logger;
        this.config = config;
    }
    /**
     * Scans all configured directories in parallel and populates the MediaIndex.
     * Uses Promise.all so that separate mount points are scanned concurrently,
     * while ffprobe concurrency is already capped inside MediaScanner.
     *
     * Requirements: 6.1
     */
    async initialScan() {
        this.logger.info({ dirs: this.dirs }, 'MediaLibrary: starting initial scan');
        this.scanInProgress = true;
        try {
            await Promise.all(this.dirs.map((dir) => this.scanner.scanDirectory(dir)));
        }
        finally {
            this.scanInProgress = false;
        }
        this.logger.info({ dirs: this.dirs, totalItems: this.index.getAllItems().length }, 'MediaLibrary: initial scan complete');
    }
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
    startWatching() {
        switch (this.config.watchMode) {
            case 'fsevents':
                this.logger.info({ dirs: this.dirs }, 'MediaLibrary: starting FSEvents watcher');
                this.watcher.start(this.dirs);
                break;
            case 'interval': {
                const intervalMs = this.config.scanIntervalSeconds * 1000;
                this.logger.info({ dirs: this.dirs, intervalSeconds: this.config.scanIntervalSeconds }, 'MediaLibrary: starting interval-based re-scan');
                this.intervalHandle = setInterval(() => {
                    this._runSequentialScan().catch((err) => {
                        this.logger.error({ err }, 'MediaLibrary: interval scan failed');
                    });
                }, intervalMs);
                break;
            }
            case 'manual':
                this.logger.info('MediaLibrary: watchMode=manual — no automatic refresh; use POST /library/refresh');
                break;
        }
    }
    /**
     * Stops the active watcher or interval timer.
     *
     * Requirements: 6.4
     */
    async stopWatching() {
        if (this.intervalHandle !== null) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
        await this.watcher.stop();
    }
    /**
     * Triggers an immediate full re-scan of all configured directories,
     * regardless of `watchMode`. Directories are scanned sequentially
     * (staggered) to limit simultaneous disk I/O.
     *
     * Returns `false` if a scan is already running (caller should 503).
     *
     * Requirements: 6.8
     */
    async refresh() {
        if (this.scanInProgress) {
            this.logger.warn('MediaLibrary.refresh(): scan already in progress, skipping');
            return false;
        }
        await this._runSequentialScan();
        return true;
    }
    // ── Private helpers ─────────────────────────────────────────────────────────
    /**
     * Scans each configured directory one at a time (sequential / staggered)
     * so that disk reads from multiple directories do not overlap.  This is
     * the approach used by both interval-mode and manual refresh.
     */
    async _runSequentialScan() {
        if (this.scanInProgress) {
            this.logger.debug('MediaLibrary._runSequentialScan: already running, skipped');
            return;
        }
        const before = this.index.getAllItems().length;
        this.logger.info({ dirs: this.dirs }, 'MediaLibrary: starting sequential re-scan');
        this.scanInProgress = true;
        try {
            for (const dir of this.dirs) {
                await this.scanner.scanDirectory(dir);
            }
        }
        finally {
            this.scanInProgress = false;
        }
        const after = this.index.getAllItems().length;
        this.logger.info({ dirs: this.dirs, itemsBefore: before, itemsAfter: after, delta: after - before }, 'MediaLibrary: sequential re-scan complete');
    }
}
exports.MediaLibrary = MediaLibrary;
//# sourceMappingURL=MediaLibrary.js.map