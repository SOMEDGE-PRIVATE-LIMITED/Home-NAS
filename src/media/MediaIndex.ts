import { createHash } from 'crypto';
import * as path from 'path';

// ──────────────────────────────────────────────────────────────────────────────
// Data model interfaces (design sections 3.1, 3.2, 3.3)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Represents a single media file in the index.
 * Design section 3.1
 */
export interface MediaItem {
  id: string;
  parentId: string;
  type: 'item';
  title: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  resourceUrl: string;

  // Video metadata (optional)
  duration?: string;    // "HH:MM:SS.mmm"
  resolution?: string;  // "WxH"
  videoCodec?: string;

  // Audio metadata (optional)
  bitrate?: number;     // bits/second
  sampleRate?: number;  // Hz

  // DLNA profile
  dlnaProfile?: string; // e.g. "AVC_MP4_BL_L3_SD_AAC", "MP3", "JPEG_LRG"
}

/**
 * Represents a directory node in the media tree.
 * Design section 3.2
 */
export interface Container {
  id: string;
  parentId: string;
  type: 'container';
  title: string;
  childCount: number;
}

/**
 * Raw ffprobe output shape, as returned by MediaScanner.
 * Design section 3.3
 */
export interface FileMetadata {
  duration?: number;        // seconds (float)
  width?: number;
  height?: number;
  videoCodec?: string;
  audioBitrate?: number;
  audioSampleRate?: number;
}

/**
 * Extended metadata passed to `upsert`. Includes all FileMetadata fields
 * plus the higher-level fields that MediaScanner derives before calling us.
 */
export interface UpsertMetadata extends FileMetadata {
  mimeType: string;
  fileSize: number;
  dlnaProfile?: string;
  resourceUrl: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Produces a stable, path-derived object ID: SHA-1 of the absolute path
 * truncated to 16 hex characters.
 *
 * Requirements: 1.5 (stable IDs survive server restarts)
 */
export function sha1Id(absolutePath: string): string {
  return createHash('sha1').update(absolutePath).digest('hex').slice(0, 16);
}

/**
 * Converts a float number of seconds into the DIDL-Lite duration format
 * "H:MM:SS.mmm" (or "HH:MM:SS.mmm" for ≥10 hours).
 */
function secondsToDuration(seconds: number): string {
  const totalMs = Math.round(seconds * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const hr = Math.floor(totalMin / 60);

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');

  return `${hr}:${pad2(min)}:${pad2(sec)}.${pad3(ms)}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// MediaIndex
// ──────────────────────────────────────────────────────────────────────────────

/**
 * In-memory store for the full media tree.
 *
 * Backed by two Maps:
 *   - `items`    : objectId → MediaItem | Container
 *   - `pathToId` : filePath → objectId   (for fast watcher-event lookups)
 *
 * The root container always has id = "0" and parentId = "-1" per UPnP
 * ContentDirectory convention.
 *
 * Design section 2.11
 * Requirements: 2.1, 2.4, 2.10
 */
export class MediaIndex {
  private readonly items: Map<string, MediaItem | Container>;
  private readonly pathToId: Map<string, string>;

  constructor() {
    this.items = new Map();
    this.pathToId = new Map();

    // Pre-populate the mandatory root container (id="0", parentId="-1")
    const root: Container = {
      id: '0',
      parentId: '-1',
      type: 'container',
      title: 'Root',
      childCount: 0,
    };
    this.items.set('0', root);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Returns the item or container with the given object ID, or `undefined` if
   * no such entry exists.
   */
  getById(id: string): MediaItem | Container | undefined {
    return this.items.get(id);
  }

  /**
   * Returns all items and containers whose `parentId` matches the given ID.
   */
  getChildren(parentId: string): Array<MediaItem | Container> {
    const result: Array<MediaItem | Container> = [];
    for (const entry of this.items.values()) {
      if (entry.parentId === parentId) {
        result.push(entry);
      }
    }
    return result;
  }

  /**
   * Creates or updates the `MediaItem` for `filePath`, deriving the container
   * hierarchy from the path and creating or incrementing `Container` nodes for
   * each directory segment as needed.
   *
   * The `metadata` parameter carries both the raw ffprobe output and the
   * higher-level fields that MediaScanner has already resolved (mimeType,
   * fileSize, dlnaProfile, resourceUrl).
   */
  upsert(filePath: string, metadata: UpsertMetadata): void {
    const absoluteFilePath = path.resolve(filePath);
    const itemId = sha1Id(absoluteFilePath);
    const title = path.basename(absoluteFilePath, path.extname(absoluteFilePath));

    // Build/ensure container chain, returning the direct parent container ID.
    const parentId = this._ensureContainerChain(path.dirname(absoluteFilePath));

    // Compose optional fields from ffprobe output
    const duration =
      typeof metadata.duration === 'number'
        ? secondsToDuration(metadata.duration)
        : undefined;

    const resolution =
      typeof metadata.width === 'number' && typeof metadata.height === 'number'
        ? `${metadata.width}x${metadata.height}`
        : undefined;

    const item: MediaItem = {
      id: itemId,
      parentId,
      type: 'item',
      title,
      filePath: absoluteFilePath,
      mimeType: metadata.mimeType,
      fileSize: metadata.fileSize,
      resourceUrl: metadata.resourceUrl,
      ...(duration !== undefined && { duration }),
      ...(resolution !== undefined && { resolution }),
      ...(metadata.videoCodec !== undefined && { videoCodec: metadata.videoCodec }),
      ...(metadata.audioBitrate !== undefined && { bitrate: metadata.audioBitrate }),
      ...(metadata.audioSampleRate !== undefined && { sampleRate: metadata.audioSampleRate }),
      ...(metadata.dlnaProfile !== undefined && { dlnaProfile: metadata.dlnaProfile }),
    };

    const isNew = !this.pathToId.has(absoluteFilePath);

    if (!isNew) {
      // Removing the old item may change the parent's childCount if the parent
      // changed (edge case: file moved). Handle gracefully.
      const oldId = this.pathToId.get(absoluteFilePath)!;
      const oldItem = this.items.get(oldId) as MediaItem | undefined;
      if (oldItem && oldItem.parentId !== parentId) {
        this._decrementChildCount(oldItem.parentId);
      }
      // Replace in place (same ID because path is the same)
      this.items.set(itemId, item);
    } else {
      this.items.set(itemId, item);
      this._incrementChildCount(parentId);
    }

    this.pathToId.set(absoluteFilePath, itemId);
  }

  /**
   * Removes the `MediaItem` for `filePath` and decrements the parent
   * container's `childCount`. Also removes empty intermediate containers
   * (except the root).
   */
  remove(filePath: string): void {
    const absoluteFilePath = path.resolve(filePath);
    const itemId = this.pathToId.get(absoluteFilePath);
    if (itemId === undefined) {
      return; // not tracked — nothing to do
    }

    const item = this.items.get(itemId);
    if (item !== undefined) {
      this._decrementChildCount(item.parentId);
      this.items.delete(itemId);
    }
    this.pathToId.delete(absoluteFilePath);
  }

  /**
   * Returns all `MediaItem` entries (not containers) in the index.
   */
  getAllItems(): MediaItem[] {
    const result: MediaItem[] = [];
    for (const entry of this.items.values()) {
      if (entry.type === 'item') {
        result.push(entry);
      }
    }
    return result;
  }

  /**
   * Case-insensitive substring search on `MediaItem.title`.
   * Containers are excluded from results.
   *
   * Requirements: 2.10
   */
  search(term: string): MediaItem[] {
    const lowerTerm = term.toLowerCase();
    const result: MediaItem[] = [];
    for (const entry of this.items.values()) {
      if (entry.type === 'item' && entry.title.toLowerCase().includes(lowerTerm)) {
        result.push(entry);
      }
    }
    return result;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Ensures a `Container` node exists for every directory segment from the
   * root down to `absoluteDirPath`, creating nodes as needed.
   *
   * Returns the object ID of the deepest container (i.e. the direct parent of
   * the file being upserted).
   *
   * The root container (id="0") acts as the logical parent for the first level
   * of each media-root directory (the filesystem root "/" is intentionally
   * not added as a container node).
   */
  private _ensureContainerChain(absoluteDirPath: string): string {
    // Decompose the path into segments, skipping the filesystem root "/"
    const segments = absoluteDirPath.split(path.sep).filter(Boolean);

    let currentParentId = '0';
    let currentPath = '';

    for (const segment of segments) {
      currentPath = currentPath
        ? `${currentPath}${path.sep}${segment}`
        : `${path.sep}${segment}`;

      const containerId = sha1Id(currentPath);

      if (!this.items.has(containerId)) {
        const container: Container = {
          id: containerId,
          parentId: currentParentId,
          type: 'container',
          title: segment,
          childCount: 0,
        };
        this.items.set(containerId, container);
        this._incrementChildCount(currentParentId);
      }

      currentParentId = containerId;
    }

    return currentParentId;
  }

  private _incrementChildCount(parentId: string): void {
    const parent = this.items.get(parentId);
    if (parent && parent.type === 'container') {
      (parent as Container).childCount++;
    }
  }

  private _decrementChildCount(parentId: string): void {
    const parent = this.items.get(parentId);
    if (parent && parent.type === 'container') {
      const c = parent as Container;
      if (c.childCount > 0) {
        c.childCount--;
      }
    }
  }
}
