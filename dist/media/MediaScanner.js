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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaScanner = exports.SUPPORTED_EXTENSIONS = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ffmpeg = __importStar(require("fluent-ffmpeg"));
const MediaIndex_js_1 = require("./MediaIndex.js");
// ──────────────────────────────────────────────────────────────────────────────
// Constants — MIME types and DLNA profiles (design sections 2.9, 3.4)
// ──────────────────────────────────────────────────────────────────────────────
const MIME_TYPE_MAP = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/avi',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.m4a': 'audio/mp4',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
};
const DLNA_PROFILE_MAP = {
    '.mp4': 'AVC_MP4_BL_L3_SD_AAC',
    '.mkv': 'MATROSKA',
    '.avi': 'AVI',
    '.mov': 'QT',
    '.mp3': 'MP3',
    '.flac': 'FLAC',
    '.aac': 'AAC_ADTS',
    '.m4a': 'AAC_ISO',
    '.jpg': 'JPEG_LRG',
    '.jpeg': 'JPEG_LRG',
    '.png': 'PNG_LRG',
};
/** All supported file extensions (lowercase). */
exports.SUPPORTED_EXTENSIONS = new Set(Object.keys(MIME_TYPE_MAP));
// ──────────────────────────────────────────────────────────────────────────────
// Semaphore — limits concurrent ffprobe calls to a configurable ceiling
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Minimal semaphore: tracks the number of active probes and queues callbacks
 * when the limit is reached. Callers `await acquire()` then call `release()`
 * in a finally block.
 */
class Semaphore {
    max;
    active = 0;
    queue = [];
    constructor(max) {
        this.max = max;
    }
    acquire() {
        if (this.active < this.max) {
            this.active++;
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this.queue.push(() => {
                this.active++;
                resolve();
            });
        });
    }
    release() {
        this.active--;
        const next = this.queue.shift();
        if (next) {
            next();
        }
    }
}
// ──────────────────────────────────────────────────────────────────────────────
// MediaScanner
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Scans configured directories, identifies supported media files by extension,
 * extracts metadata via ffprobe, and upserts items into the MediaIndex.
 *
 * Design section 2.9
 * Requirements: 6.1, 6.5, 2.7, 2.8
 */
class MediaScanner {
    index;
    logger;
    baseUrl;
    semaphore;
    /** Set to true after the first ffprobe failure caused by missing ffprobe binary. */
    ffprobeUnavailable = false;
    constructor(index, logger, baseUrl, 
    /** Max parallel ffprobe calls. Defaults to 4. Lower values reduce disk I/O on slow drives. */
    ffprobeConcurrency = 4) {
        this.index = index;
        this.logger = logger;
        this.baseUrl = baseUrl;
        this.semaphore = new Semaphore(ffprobeConcurrency);
    }
    // ── Public API ──────────────────────────────────────────────────────────────
    /**
     * Indexes a single file: checks that its extension is supported, then probes
     * and upserts it into the MediaIndex.
     *
     * Intended for use by `FilesystemWatcher` to handle `add` and `change`
     * events for individual files without having to re-scan entire directories.
     *
     * Requirements: 6.2, 6.3
     */
    async indexFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        if (!exports.SUPPORTED_EXTENSIONS.has(ext)) {
            return; // silently skip unsupported file types
        }
        await this._processFile(filePath, ext);
    }
    /**
     * Recursively walks `dir`, finds all supported media files, and upserts each
     * one into the MediaIndex with its resolved metadata.
     *
     * Non-existent directories are skipped with a warning log (requirement 6.1).
     *
     * Requirements: 6.1, 6.5
     */
    async scanDirectory(dir) {
        const absoluteDir = path.resolve(dir);
        // Skip non-existent directories with a warning
        if (!fs.existsSync(absoluteDir)) {
            this.logger.warn({ dir: absoluteDir }, 'MediaScanner: directory does not exist, skipping');
            return;
        }
        let entries;
        try {
            // Node.js 20: recursive readdir with withFileTypes returns all descendants
            entries = await fs.promises.readdir(absoluteDir, {
                withFileTypes: true,
                recursive: true,
            });
        }
        catch (err) {
            this.logger.warn({ dir: absoluteDir, err }, 'MediaScanner: failed to read directory, skipping');
            return;
        }
        const scanTasks = [];
        for (const entry of entries) {
            if (!entry.isFile()) {
                continue;
            }
            const ext = path.extname(entry.name).toLowerCase();
            if (!exports.SUPPORTED_EXTENSIONS.has(ext)) {
                continue;
            }
            // On Node.js 20 with recursive:true, entry.path (or entry.parentPath in
            // Node.js 21+) holds the directory that contains the entry.
            // We use the 'path' property (which is set in Node.js 20) as the parent dir.
            const parentDir = entry.parentPath ??
                entry.path ??
                absoluteDir;
            const filePath = path.join(parentDir, entry.name);
            scanTasks.push(this._processFile(filePath, ext));
        }
        await Promise.all(scanTasks);
    }
    /**
     * Probes a single file with ffprobe and returns raw FileMetadata.
     * Returns `null` when ffprobe is unavailable or the probe fails.
     *
     * Requirements: 2.7, 2.8
     */
    async probeFile(filePath) {
        if (this.ffprobeUnavailable) {
            return null;
        }
        await this.semaphore.acquire();
        try {
            return await this._runFfprobe(filePath);
        }
        finally {
            this.semaphore.release();
        }
    }
    // ── Private helpers ─────────────────────────────────────────────────────────
    /** Process a single media file: probe + upsert into the index. */
    async _processFile(filePath, ext) {
        const mimeType = MIME_TYPE_MAP[ext];
        const dlnaProfile = DLNA_PROFILE_MAP[ext];
        let fileSize = 0;
        try {
            fileSize = fs.statSync(filePath).size;
        }
        catch (err) {
            this.logger.warn({ filePath, err }, 'MediaScanner: failed to stat file, skipping');
            return;
        }
        const itemId = (0, MediaIndex_js_1.sha1Id)(path.resolve(filePath));
        const resourceUrl = `${this.baseUrl}/stream/${itemId}`;
        const metadata = await this.probeFile(filePath);
        this.index.upsert(filePath, {
            mimeType,
            fileSize,
            dlnaProfile,
            resourceUrl,
            ...(metadata ?? {}),
        });
    }
    /**
     * Wraps the callback-based `ffprobe()` function from fluent-ffmpeg in a
     * Promise.  Handles the case where ffprobe is not installed.
     */
    _runFfprobe(filePath) {
        return new Promise((resolve) => {
            ffmpeg.ffprobe(filePath, (err, data) => {
                if (err) {
                    // Detect missing ffprobe binary.  fluent-ffmpeg surfaces this as an
                    // error message containing "ffprobe".
                    const message = err instanceof Error ? err.message : String(err);
                    if (message.toLowerCase().includes('ffprobe')) {
                        if (!this.ffprobeUnavailable) {
                            this.logger.warn({ err }, 'MediaScanner: ffprobe is not installed — media metadata will be omitted');
                            this.ffprobeUnavailable = true;
                        }
                    }
                    else {
                        this.logger.warn({ filePath, err }, 'MediaScanner: ffprobe failed for file');
                    }
                    resolve(null);
                    return;
                }
                const videoStream = data.streams?.find((s) => s.codec_type === 'video');
                const audioStream = data.streams?.find((s) => s.codec_type === 'audio');
                const duration = data.format?.duration != null ? Number(data.format.duration) : undefined;
                const width = videoStream?.width ?? undefined;
                const height = videoStream?.height ?? undefined;
                const videoCodec = videoStream?.codec_name ?? undefined;
                // fluent-ffmpeg exposes audio bitrate on the audio stream as bit_rate (string)
                const audioBitrate = audioStream?.bit_rate != null ? Number(audioStream.bit_rate) : undefined;
                const audioSampleRate = audioStream?.sample_rate != null ? Number(audioStream.sample_rate) : undefined;
                const result = {
                    ...(duration !== undefined && { duration }),
                    ...(width !== undefined && { width }),
                    ...(height !== undefined && { height }),
                    ...(videoCodec !== undefined && { videoCodec }),
                    ...(audioBitrate !== undefined && { audioBitrate }),
                    ...(audioSampleRate !== undefined && { audioSampleRate }),
                };
                resolve(result);
            });
        });
    }
}
exports.MediaScanner = MediaScanner;
//# sourceMappingURL=MediaScanner.js.map