import type { Logger } from '../logger.js';
/**
 * Persists authenticated IP addresses to disk and provides fast in-memory lookup.
 *
 * Persistence file: ~/.config/dlna-media-server/devices.json
 * Format: { "registeredIps": ["192.168.1.50", "192.168.1.75"] }
 *
 * Design section 2.12.
 * Requirements: 10.2, 10.3, 10.5
 */
export declare class DeviceRegistry {
    /**
     * The set of currently registered IP addresses.
     * `readonly` prevents external reassignment of the reference; the Set itself
     * is mutated by `registerDevice`.
     */
    readonly registeredIps: Set<string>;
    private readonly filePath;
    private readonly logger;
    constructor(options?: {
        filePath?: string;
        logger?: Logger;
    });
    /**
     * Loads registered IPs from the persistence file into memory.
     * Called once at application startup.
     *
     * - If the file does not exist (ENOENT): initialises an empty Set — no error.
     * - If the file contains malformed JSON: logs a warning and starts with an
     *   empty registry rather than aborting.
     *
     * Requirements: 10.5
     */
    load(): void;
    /**
     * Returns `true` when the given IP address is in the registered set.
     *
     * Requirements: 10.3
     */
    isRegistered(ip: string): boolean;
    /**
     * Adds an IP address to the registered set and immediately persists the
     * updated registry to disk.
     *
     * Requirements: 10.2
     */
    registerDevice(ip: string): void;
    /**
     * Writes the current registry to disk as pretty-printed JSON.
     * Creates the directory if it does not already exist.
     *
     * Format: { "registeredIps": [...] }
     *
     * Requirements: 10.5
     */
    persist(): void;
}
//# sourceMappingURL=DeviceRegistry.d.ts.map