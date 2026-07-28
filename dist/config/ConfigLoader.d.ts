export interface ServerConfig {
    friendlyName: string;
    port: number;
    mediaDirectories: string[];
    pin: string;
    logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    /** Library refresh strategy. Default: "fsevents".
     *  - "fsevents": native macOS FSEvents via chokidar (best for SSDs)
     *  - "interval": full re-scan on a timer (recommended for slow HDDs)
     *  - "manual":   no automatic refresh; use POST /library/refresh */
    watchMode: 'fsevents' | 'interval' | 'manual';
    /** Seconds between re-scans when watchMode="interval". Default: 300. */
    scanIntervalSeconds: number;
    /** Max parallel ffprobe calls during a scan. Lower = less disk I/O. Default: 4. */
    ffprobeConcurrency: number;
}
/**
 * Loads, parses, and validates the server configuration.
 *
 * Config file path resolution order:
 *   1. DLNA_CONFIG environment variable (if set)
 *   2. ~/.config/dlna-media-server/config.json
 *
 * On any error (missing file, malformed JSON, schema violation) a descriptive
 * message is written to stderr and the process exits with code 1.
 *
 * Requirements: 5.1, 5.3, 5.4, 5.5, 10.6
 */
export declare function loadConfig(): ServerConfig;
//# sourceMappingURL=ConfigLoader.d.ts.map