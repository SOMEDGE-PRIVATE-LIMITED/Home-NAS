import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import * as path from 'path';
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
export class FilesystemWatcher {
  private watcher: FSWatcher | null = null;

  constructor(
    private readonly scanner: MediaScanner,
    private readonly index: MediaIndex,
    private readonly logger: Logger,
  ) {}

  /**
   * Starts watching the given directories.  Subsequent calls to `start` on an
   * already-running watcher are ignored — call `stop()` first if you need to
   * change the watched set.
   *
   * Requirements: 6.2
   */
  start(dirs: string[]): void {
    if (this.watcher !== null) {
      this.logger.warn('FilesystemWatcher.start() called while already running — ignoring');
      return;
    }

    this.watcher = chokidar.watch(dirs, {
      usePolling: false,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
      },
      // Do not emit 'add' events for files that already exist when the watcher
      // starts (the initial scan handled by MediaScanner covers those).
      ignoreInitial: true,
      // Only watch files whose extensions are in SUPPORTED_EXTENSIONS.
      // Using a function predicate ensures chokidar still traverses directories
      // (for which path.extname returns '') while filtering individual files.
      ignored: (filePath: string, stats?: { isDirectory?: () => boolean }) => {
        if (!stats || stats.isDirectory?.()) {
          return false; // always watch directories so chokidar recurses into them
        }
        const ext = path.extname(filePath).toLowerCase();
        // Reject files whose extension is not in the supported set
        const supported = ['.mp4', '.mkv', '.avi', '.mov', '.mp3', '.flac', '.aac', '.m4a', '.jpg', '.jpeg', '.png'];
        return !supported.includes(ext);
      },
    });

    this.watcher
      .on('add', (filePath: string) => {
        this.logger.debug({ filePath }, 'FilesystemWatcher: file added');
        this.scanner.indexFile(filePath).catch((err: unknown) => {
          this.logger.warn({ filePath, err }, 'FilesystemWatcher: failed to index added file');
        });
      })
      .on('change', (filePath: string) => {
        this.logger.debug({ filePath }, 'FilesystemWatcher: file changed');
        this.scanner.indexFile(filePath).catch((err: unknown) => {
          this.logger.warn({ filePath, err }, 'FilesystemWatcher: failed to index changed file');
        });
      })
      .on('unlink', (filePath: string) => {
        this.logger.debug({ filePath }, 'FilesystemWatcher: file removed');
        this.index.remove(filePath);
      })
      .on('error', (err: unknown) => {
        this.logger.error({ err }, 'FilesystemWatcher: chokidar error');
      });
  }

  /**
   * Stops the watcher and releases all underlying resources.  Safe to call
   * even if the watcher has not been started yet.
   *
   * Requirements: 6.4
   */
  async stop(): Promise<void> {
    if (this.watcher !== null) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}
