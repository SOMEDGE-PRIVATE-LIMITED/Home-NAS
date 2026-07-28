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
    duration?: string;
    resolution?: string;
    videoCodec?: string;
    bitrate?: number;
    sampleRate?: number;
    dlnaProfile?: string;
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
    duration?: number;
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
/**
 * Produces a stable, path-derived object ID: SHA-1 of the absolute path
 * truncated to 16 hex characters.
 *
 * Requirements: 1.5 (stable IDs survive server restarts)
 */
export declare function sha1Id(absolutePath: string): string;
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
export declare class MediaIndex {
    private readonly items;
    private readonly pathToId;
    constructor();
    /**
     * Returns the item or container with the given object ID, or `undefined` if
     * no such entry exists.
     */
    getById(id: string): MediaItem | Container | undefined;
    /**
     * Returns all items and containers whose `parentId` matches the given ID.
     */
    getChildren(parentId: string): Array<MediaItem | Container>;
    /**
     * Creates or updates the `MediaItem` for `filePath`, deriving the container
     * hierarchy from the path and creating or incrementing `Container` nodes for
     * each directory segment as needed.
     *
     * The `metadata` parameter carries both the raw ffprobe output and the
     * higher-level fields that MediaScanner has already resolved (mimeType,
     * fileSize, dlnaProfile, resourceUrl).
     */
    upsert(filePath: string, metadata: UpsertMetadata): void;
    /**
     * Removes the `MediaItem` for `filePath` and decrements the parent
     * container's `childCount`. Also removes empty intermediate containers
     * (except the root).
     */
    remove(filePath: string): void;
    /**
     * Returns all `MediaItem` entries (not containers) in the index.
     */
    getAllItems(): MediaItem[];
    /**
     * Case-insensitive substring search on `MediaItem.title`.
     * Containers are excluded from results.
     *
     * Requirements: 2.10
     */
    search(term: string): MediaItem[];
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
    private _ensureContainerChain;
    private _incrementChildCount;
    private _decrementChildCount;
}
//# sourceMappingURL=MediaIndex.d.ts.map