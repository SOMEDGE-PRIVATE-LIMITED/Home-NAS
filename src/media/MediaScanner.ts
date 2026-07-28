import * as fs from 'fs';
import * as path from 'path';
import * as ffmpeg from 'fluent-ffmpeg';
import type { Logger } from '../logger.js';
import { type MediaIndex, type FileMetadata, sha1Id } from './MediaIndex.js';

// ──────────────────────────────────────────────────────────────────────────────
// Constants — MIME types and DLNA profiles (design sections 2.9, 3.4)
// ──────────────────────────────────────────────────────────────────────────────

const MIME_TYPE_MAP: Record<string, string> = {
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

const DLNA_PROFILE_MAP: Record<string, string> = {
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
export const SUPPORTED_EXTENSIONS = new Set(Object.keys(MIME_TYPE_MAP));

// ──────────────────────────────────────────────────────────────────────────────
// Semaphore — limits concurrent ffprobe calls to MAX_CONCURRENT_PROBES
// ──────────────────────────────────────────────────────────────────────────────

const MAX_CONCURRENT_PROBES = 4;

/**
 * Minimal semaphore: tracks the number of active probes and queues callbacks
 * when the limit is reached. Callers `await acquire()` then call `release()`
 * in a finally block.
 */
class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  release(): void {
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
export class MediaScanner {
  private readonly semaphore = new Semaphore(MAX_CONCURRENT_PROBES);
  /** Set to true after the first ffprobe failure caused by missing ffprobe binary. */
  private ffprobeUnavailable = false;

  constructor(
    private readonly index: MediaIndex,
    private readonly logger: Logger,
    private readonly baseUrl: string,
  ) {}

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
  async indexFile(filePath: string): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
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
  async scanDirectory(dir: string): Promise<void> {
    const absoluteDir = path.resolve(dir);

    // Skip non-existent directories with a warning
    if (!fs.existsSync(absoluteDir)) {
      this.logger.warn({ dir: absoluteDir }, 'MediaScanner: directory does not exist, skipping');
      return;
    }

    let entries: fs.Dirent[];
    try {
      // Node.js 20: recursive readdir with withFileTypes returns all descendants
      entries = await fs.promises.readdir(absoluteDir, {
        withFileTypes: true,
        recursive: true,
      });
    } catch (err) {
      this.logger.warn({ dir: absoluteDir, err }, 'MediaScanner: failed to read directory, skipping');
      return;
    }

    const scanTasks: Promise<void>[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        continue;
      }

      // On Node.js 20 with recursive:true, entry.path (or entry.parentPath in
      // Node.js 21+) holds the directory that contains the entry.
      // We use the 'path' property (which is set in Node.js 20) as the parent dir.
      const parentDir: string =
        (entry as unknown as { path?: string; parentPath?: string }).parentPath ??
        (entry as unknown as { path?: string }).path ??
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
  async probeFile(filePath: string): Promise<FileMetadata | null> {
    if (this.ffprobeUnavailable) {
      return null;
    }

    await this.semaphore.acquire();
    try {
      return await this._runFfprobe(filePath);
    } finally {
      this.semaphore.release();
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Process a single media file: probe + upsert into the index. */
  private async _processFile(filePath: string, ext: string): Promise<void> {
    const mimeType = MIME_TYPE_MAP[ext]!;
    const dlnaProfile = DLNA_PROFILE_MAP[ext];

    let fileSize = 0;
    try {
      fileSize = fs.statSync(filePath).size;
    } catch (err) {
      this.logger.warn({ filePath, err }, 'MediaScanner: failed to stat file, skipping');
      return;
    }

    const itemId = sha1Id(path.resolve(filePath));
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
  private _runFfprobe(filePath: string): Promise<FileMetadata | null> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, data) => {
        if (err) {
          // Detect missing ffprobe binary.  fluent-ffmpeg surfaces this as an
          // error message containing "ffprobe".
          const message: string = err instanceof Error ? err.message : String(err);
          if (message.toLowerCase().includes('ffprobe')) {
            if (!this.ffprobeUnavailable) {
              this.logger.warn(
                { err },
                'MediaScanner: ffprobe is not installed — media metadata will be omitted',
              );
              this.ffprobeUnavailable = true;
            }
          } else {
            this.logger.warn({ filePath, err }, 'MediaScanner: ffprobe failed for file');
          }
          resolve(null);
          return;
        }

        const videoStream = data.streams?.find((s) => s.codec_type === 'video');
        const audioStream = data.streams?.find((s) => s.codec_type === 'audio');

        const duration =
          data.format?.duration != null ? Number(data.format.duration) : undefined;

        const width = videoStream?.width ?? undefined;
        const height = videoStream?.height ?? undefined;
        const videoCodec = videoStream?.codec_name ?? undefined;

        // fluent-ffmpeg exposes audio bitrate on the audio stream as bit_rate (string)
        const audioBitrate =
          audioStream?.bit_rate != null ? Number(audioStream.bit_rate) : undefined;
        const audioSampleRate =
          audioStream?.sample_rate != null ? Number(audioStream.sample_rate) : undefined;

        const result: FileMetadata = {
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
