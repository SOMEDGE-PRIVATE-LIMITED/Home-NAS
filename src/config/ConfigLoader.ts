import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ServerConfig interface as defined in design section 2.1 and 3.5
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

// Defaults per design section 3.5
const DEFAULTS: Omit<ServerConfig, 'mediaDirectories'> = {
  friendlyName: 'DLNA Media Server',
  port: 8200,
  pin: '',
  logLevel: 'INFO',
  watchMode: 'fsevents',
  scanIntervalSeconds: 300,
  ffprobeConcurrency: 4,
};

const VALID_LOG_LEVELS: ReadonlyArray<string> = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
const VALID_WATCH_MODES: ReadonlyArray<string> = ['fsevents', 'interval', 'manual'];

const DEFAULT_CONFIG_PATH = path.join(
  os.homedir(),
  '.config',
  'dlna-media-server',
  'config.json'
);

/**
 * Resolves the config file path.
 * Uses the DLNA_CONFIG environment variable when set, otherwise falls back
 * to the default path: ~/.config/dlna-media-server/config.json
 */
function resolveConfigPath(): string {
  return process.env.DLNA_CONFIG ?? DEFAULT_CONFIG_PATH;
}

/**
 * Validates the parsed config object and applies defaults for optional fields.
 * Returns a fully-populated ServerConfig on success.
 * Logs a descriptive error and exits with code 1 on schema violations.
 *
 * Requirements: 5.1, 5.3, 5.4, 5.5, 10.6
 */
function validateAndApplyDefaults(raw: Record<string, unknown>): ServerConfig {
  const errors: string[] = [];

  // --- Required: mediaDirectories ---
  if (!Object.prototype.hasOwnProperty.call(raw, 'mediaDirectories')) {
    errors.push('Missing required field: "mediaDirectories"');
  } else if (!Array.isArray(raw.mediaDirectories)) {
    errors.push('"mediaDirectories" must be an array of strings');
  } else {
    const dirs = raw.mediaDirectories as unknown[];
    if (dirs.length < 1) {
      errors.push('"mediaDirectories" must contain at least one entry (minItems: 1)');
    } else {
      dirs.forEach((d, i) => {
        if (typeof d !== 'string') {
          errors.push(`"mediaDirectories[${i}]" must be a string, got ${typeof d}`);
        }
      });
    }
  }

  // --- Optional: port (integer, 1024–65535) ---
  if (Object.prototype.hasOwnProperty.call(raw, 'port')) {
    const port = raw.port;
    if (typeof port !== 'number' || !Number.isInteger(port)) {
      errors.push('"port" must be an integer');
    } else if (port < 1024 || port > 65535) {
      errors.push(`"port" must be between 1024 and 65535 (got ${port})`);
    }
  }

  // --- Optional: friendlyName (string) ---
  if (Object.prototype.hasOwnProperty.call(raw, 'friendlyName')) {
    if (typeof raw.friendlyName !== 'string') {
      errors.push('"friendlyName" must be a string');
    }
  }

  // --- Optional: pin (string) ---
  if (Object.prototype.hasOwnProperty.call(raw, 'pin')) {
    if (typeof raw.pin !== 'string') {
      errors.push('"pin" must be a string');
    }
  }

  // --- Optional: logLevel (enum) ---
  if (Object.prototype.hasOwnProperty.call(raw, 'logLevel')) {
    if (typeof raw.logLevel !== 'string' || !VALID_LOG_LEVELS.includes(raw.logLevel)) {
      errors.push(
        `"logLevel" must be one of ${VALID_LOG_LEVELS.join(', ')} (got "${raw.logLevel}")`
      );
    }
  }

  // --- Optional: watchMode (enum) ---
  if (Object.prototype.hasOwnProperty.call(raw, 'watchMode')) {
    if (typeof raw.watchMode !== 'string' || !VALID_WATCH_MODES.includes(raw.watchMode)) {
      errors.push(
        `"watchMode" must be one of ${VALID_WATCH_MODES.join(', ')} (got "${raw.watchMode}")`
      );
    }
  }

  // --- Optional: scanIntervalSeconds (integer >= 60) ---
  if (Object.prototype.hasOwnProperty.call(raw, 'scanIntervalSeconds')) {
    const v = raw.scanIntervalSeconds;
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      errors.push('"scanIntervalSeconds" must be an integer');
    } else if (v < 60) {
      errors.push(`"scanIntervalSeconds" must be at least 60 (got ${v})`);
    }
  }

  // --- Optional: ffprobeConcurrency (integer 1–16) ---
  if (Object.prototype.hasOwnProperty.call(raw, 'ffprobeConcurrency')) {
    const v = raw.ffprobeConcurrency;
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      errors.push('"ffprobeConcurrency" must be an integer');
    } else if (v < 1 || v > 16) {
      errors.push(`"ffprobeConcurrency" must be between 1 and 16 (got ${v})`);
    }
  }

  if (errors.length > 0) {
    process.stderr.write(
      `[dlna-media-server] Config validation failed:\n` +
        errors.map((e) => `  - ${e}`).join('\n') +
        '\n'
    );
    process.exit(1);
  }

  // Build the validated config with defaults applied
  const config: ServerConfig = {
    friendlyName:
      typeof raw.friendlyName === 'string' ? raw.friendlyName : DEFAULTS.friendlyName,
    port: typeof raw.port === 'number' && Number.isInteger(raw.port) ? raw.port : DEFAULTS.port,
    mediaDirectories: raw.mediaDirectories as string[],
    pin: typeof raw.pin === 'string' ? raw.pin : DEFAULTS.pin,
    logLevel: VALID_LOG_LEVELS.includes(raw.logLevel as string)
      ? (raw.logLevel as ServerConfig['logLevel'])
      : DEFAULTS.logLevel,
    watchMode: VALID_WATCH_MODES.includes(raw.watchMode as string)
      ? (raw.watchMode as ServerConfig['watchMode'])
      : DEFAULTS.watchMode,
    scanIntervalSeconds:
      typeof raw.scanIntervalSeconds === 'number' && Number.isInteger(raw.scanIntervalSeconds) && raw.scanIntervalSeconds >= 60
        ? raw.scanIntervalSeconds
        : DEFAULTS.scanIntervalSeconds,
    ffprobeConcurrency:
      typeof raw.ffprobeConcurrency === 'number' && Number.isInteger(raw.ffprobeConcurrency) && raw.ffprobeConcurrency >= 1 && raw.ffprobeConcurrency <= 16
        ? raw.ffprobeConcurrency
        : DEFAULTS.ffprobeConcurrency,
  };

  return config;
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
export function loadConfig(): ServerConfig {
  const configPath = resolveConfigPath();

  // --- Read file ---
  let rawContent: string;
  try {
    rawContent = fs.readFileSync(configPath, 'utf-8');
  } catch (err) {
    const message =
      err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT'
        ? `Config file not found: ${configPath}`
        : `Failed to read config file at ${configPath}: ${err instanceof Error ? err.message : String(err)}`;
    process.stderr.write(`[dlna-media-server] ${message}\n`);
    process.exit(1);
  }

  // --- Parse JSON ---
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (err) {
    const detail = err instanceof SyntaxError ? err.message : String(err);
    process.stderr.write(
      `[dlna-media-server] Failed to parse config file at ${configPath}: ${detail}\n`
    );
    process.exit(1);
  }

  // --- Ensure root is an object ---
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    process.stderr.write(
      `[dlna-media-server] Config file must contain a JSON object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}\n`
    );
    process.exit(1);
  }

  return validateAndApplyDefaults(parsed as Record<string, unknown>);
}
