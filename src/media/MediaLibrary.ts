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
export class MediaLibrary {
  constructor(
    private readonly dirs: string[],
    private readonly scanner: MediaScanner,
    private readonly watcher: FilesystemWatcher,
    private readonly index: MediaIndex,
    private readonly logger: Logger,
  ) {}

  /**
   * Scans all configured directories in parallel and populates the MediaIndex.
   *
   * All `scanner.scanDirectory()` calls run concurrently via `Promise.all` so
   * that large libraries on separate mount points are scanned simultaneously.
   *
   * Requirements: 6.1
   */
  async initialScan(): Promise<void> {
    this.logger.info({ dirs: this.dirs }, 'MediaLibrary: starting initial scan');

    await Promise.all(this.dirs.map((dir) => this.scanner.scanDirectory(dir)));

    this.logger.info(
      { dirs: this.dirs, totalItems: this.index.getAllItems().length },
      'MediaLibrary: initial scan complete',
    );
  }

  /**
   * Starts the FilesystemWatcher on all configured directories so that
   * subsequent file-system events update the MediaIndex in real time.
   *
   * Requirements: 6.2, 6.3
   */
  startWatching(): void {
    this.logger.info({ dirs: this.dirs }, 'MediaLibrary: starting filesystem watcher');
    this.watcher.start(this.dirs);
  }

  /**
   * Stops the FilesystemWatcher and releases underlying resources.
   *
   * Requirements: 6.4
   */
  stopWatching(): Promise<void> {
    return this.watcher.stop();
  }
}
