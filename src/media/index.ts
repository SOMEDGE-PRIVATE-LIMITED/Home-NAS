// Media module — implemented in Tasks 4–7: MediaIndex, MediaScanner, FilesystemWatcher, MediaLibrary

export { MediaIndex, sha1Id } from './MediaIndex.js';
export type { MediaItem, Container, FileMetadata, UpsertMetadata } from './MediaIndex.js';

export { MediaScanner, SUPPORTED_EXTENSIONS } from './MediaScanner.js';

export { FilesystemWatcher } from './FilesystemWatcher.js';

export { MediaLibrary } from './MediaLibrary.js';
