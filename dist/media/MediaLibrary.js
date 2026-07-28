"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaLibrary = void 0;
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
class MediaLibrary {
    dirs;
    scanner;
    watcher;
    index;
    logger;
    constructor(dirs, scanner, watcher, index, logger) {
        this.dirs = dirs;
        this.scanner = scanner;
        this.watcher = watcher;
        this.index = index;
        this.logger = logger;
    }
    /**
     * Scans all configured directories in parallel and populates the MediaIndex.
     *
     * All `scanner.scanDirectory()` calls run concurrently via `Promise.all` so
     * that large libraries on separate mount points are scanned simultaneously.
     *
     * Requirements: 6.1
     */
    async initialScan() {
        this.logger.info({ dirs: this.dirs }, 'MediaLibrary: starting initial scan');
        await Promise.all(this.dirs.map((dir) => this.scanner.scanDirectory(dir)));
        this.logger.info({ dirs: this.dirs, totalItems: this.index.getAllItems().length }, 'MediaLibrary: initial scan complete');
    }
    /**
     * Starts the FilesystemWatcher on all configured directories so that
     * subsequent file-system events update the MediaIndex in real time.
     *
     * Requirements: 6.2, 6.3
     */
    startWatching() {
        this.logger.info({ dirs: this.dirs }, 'MediaLibrary: starting filesystem watcher');
        this.watcher.start(this.dirs);
    }
    /**
     * Stops the FilesystemWatcher and releases underlying resources.
     *
     * Requirements: 6.4
     */
    stopWatching() {
        return this.watcher.stop();
    }
}
exports.MediaLibrary = MediaLibrary;
//# sourceMappingURL=MediaLibrary.js.map