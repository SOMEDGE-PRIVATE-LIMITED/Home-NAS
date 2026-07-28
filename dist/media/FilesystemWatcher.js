"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilesystemWatcher = void 0;
const chokidar_1 = __importDefault(require("chokidar"));
const path = __importStar(require("path"));
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
class FilesystemWatcher {
    scanner;
    index;
    logger;
    watcher = null;
    constructor(scanner, index, logger) {
        this.scanner = scanner;
        this.index = index;
        this.logger = logger;
    }
    /**
     * Starts watching the given directories.  Subsequent calls to `start` on an
     * already-running watcher are ignored — call `stop()` first if you need to
     * change the watched set.
     *
     * Requirements: 6.2
     */
    start(dirs) {
        if (this.watcher !== null) {
            this.logger.warn('FilesystemWatcher.start() called while already running — ignoring');
            return;
        }
        this.watcher = chokidar_1.default.watch(dirs, {
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
            ignored: (filePath, stats) => {
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
            .on('add', (filePath) => {
            this.logger.debug({ filePath }, 'FilesystemWatcher: file added');
            this.scanner.indexFile(filePath).catch((err) => {
                this.logger.warn({ filePath, err }, 'FilesystemWatcher: failed to index added file');
            });
        })
            .on('change', (filePath) => {
            this.logger.debug({ filePath }, 'FilesystemWatcher: file changed');
            this.scanner.indexFile(filePath).catch((err) => {
                this.logger.warn({ filePath, err }, 'FilesystemWatcher: failed to index changed file');
            });
        })
            .on('unlink', (filePath) => {
            this.logger.debug({ filePath }, 'FilesystemWatcher: file removed');
            this.index.remove(filePath);
        })
            .on('error', (err) => {
            this.logger.error({ err }, 'FilesystemWatcher: chokidar error');
        });
    }
    /**
     * Stops the watcher and releases all underlying resources.  Safe to call
     * even if the watcher has not been started yet.
     *
     * Requirements: 6.4
     */
    async stop() {
        if (this.watcher !== null) {
            await this.watcher.close();
            this.watcher = null;
        }
    }
}
exports.FilesystemWatcher = FilesystemWatcher;
//# sourceMappingURL=FilesystemWatcher.js.map