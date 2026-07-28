import type { Logger } from '../logger.js';
import type { MediaIndex } from './MediaIndex.js';
import type { MediaScanner } from './MediaScanner.js';
/**
 * Wraps `chokidar@3.6.0` to watch configured media directories for filesystem
 * changes and keeps the `MediaIndex` up to date in near-real-time.
 *
 * Configuration:
 * - `usePolling: false` — uses native FSEvents on macOS (no polling overhead)
 * - `awaitWriteFinish: { stabilityThreshold: 2000 }` — waits for writes to
 *   settle before triggering events, so partially-written files are not indexed
 *
 * Event mapping:
 * - `add`    → `scanner.indexFile(filePath)` (probe + upsert)
 * - `change` → `scanner.indexFile(filePath)` (re-probe + upsert)
 * - `unlink` → `index.remove(filePath)`
 *
 * Design section 2.10
 * Requirements: 6.2, 6.3, 6.4
 */
export declare class FilesystemWatcher {
    private readonly scanner;
    private readonly index;
    private readonly logger;
    private watcher;
    constructor(scanner: MediaScanner, index: MediaIndex, logger: Logger);
    /**
     * Starts watching the given directories.  Subsequent calls to `start` on an
     * already-running watcher are ignored — call `stop()` first if you need to
     * change the watched set.
     *
     * Requirements: 6.2
     */
    start(dirs: string[]): void;
    /**
     * Stops the watcher and releases all underlying resources.  Safe to call
     * even if the watcher has not been started yet.
     *
     * Requirements: 6.4
     */
    stop(): Promise<void>;
}
//# sourceMappingURL=FilesystemWatcher.d.ts.map